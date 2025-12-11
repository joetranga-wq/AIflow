import React, { useEffect, useRef, useState } from 'react';
import * as d3Base from 'd3';
import { AIFlowProject } from '../../core/types';

const d3 = d3Base as any;

interface WorkflowGraphProps {
  project: AIFlowProject;
  onSelectAgent: (agentId: string) => void;
  onEditCondition: (linkId: string, currentCondition: string) => void;
  onNavigateToPrompt?: (filename: string) => void;
  onNavigateToTools?: () => void;
  isLinkingMode?: boolean;
  linkingSourceId?: string | null;
  onNodeClick?: (agentId: string) => void;
  selectedNodeId?: string | null;
  onLinkCreate?: (sourceId: string, targetId: string) => void;
  highlightedNodeIds?: string[];
  highlightedEdges?: { from: string; to: string }[];

  // ✅ Nieuw: validation counts per agent (errors/warnings)
  validationByAgentId?: Record<string, { errors: number; warnings: number }>;
}

const WorkflowGraph: React.FC<WorkflowGraphProps> = ({ 
    project, 
    onSelectAgent, 
    onEditCondition,
    onNavigateToPrompt,
    onNavigateToTools,
    isLinkingMode,
    linkingSourceId,
    onNodeClick,
    selectedNodeId,
    onLinkCreate,
    highlightedNodeIds,
    highlightedEdges,
    validationByAgentId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<any>(null);
  const nodesRef = useRef<any[]>([]);
  const zoomRef = useRef<any>(null);
  
  // We use a ref to track linking mode inside D3 callbacks to avoid stale closures
  const isLinkingRef = useRef(isLinkingMode);
  useEffect(() => { isLinkingRef.current = isLinkingMode; }, [isLinkingMode]);

  const [contextMenu, setContextMenu] = useState<{x: number, y: number, agentId: string, isTool: boolean, promptFile?: string} | null>(null);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // --- Definitions (Shadows, Glows, Arrows) ---
    const defs = svg.append("defs");

    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) // Adjusted for node spacing
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94A3B8");

    const filter = defs.append("filter").attr("id", "drop-shadow").attr("height", "130%");
    filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3).attr("result", "blur");
    filter.append("feOffset").attr("in", "blur").attr("dx", 2).attr("dy", 2).attr("result", "offsetBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "offsetBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const createGlow = (id: string, _color: string) => {
      const f = defs
        .append('filter')
        .attr('id', id)
        .attr('height', '150%')
        .attr('width', '150%')
        .attr('x', '-25%')
        .attr('y', '-25%');
      f.append('feGaussianBlur')
        .attr('stdDeviation', 4.5)
        .attr('result', 'coloredBlur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'coloredBlur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    };
    createGlow('glow-indigo', '');
    createGlow('glow-amber', '');

    // --- Graph Container ---
    const g = svg.append("g");
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: any) => {
        g.attr("transform", event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom).on("dblclick.zoom", null);

    // --- Data Preparation ---
    const nodes = project.agents.map(a => {
        const prev = nodesRef.current.find(n => n.id === a.id);
        const validation = validationByAgentId?.[a.id];

        return { 
            id: a.id, 
            name: a.name, 
            role: a.role,
            modelName: a.model.name,
            isTool: a.role === 'Tool',
            promptFile: a.prompt,
            executionStatus: a.executionStatus,

            // ✅ Nieuw: validation counts op node zelf
            errorCount: validation?.errors ?? 0,
            warningCount: validation?.warnings ?? 0,

            x: prev ? prev.x : Math.random() * width,
            y: prev ? prev.y : Math.random() * height,
            vx: prev ? prev.vx : 0,
            vy: prev ? prev.vy : 0
        };
    });
    nodesRef.current = nodes;

    const links = project.flow.logic.map(l => ({ 
        id: l.id,
        source: l.from, 
        target: l.to, 
        label: l.condition 
    }));

    const validLinks = links.filter(l => 
        nodes.some(n => n.id === l.source) && nodes.some(n => n.id === l.target)
    );

    // --- Simulation ---
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(validLinks).id((d: any) => d.id).distance(250))
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(80).iterations(2));

    simulationRef.current = simulation;

    // --- Draw Links ---
    const linkGroup = g.append("g").selectAll("path")
      .data(validLinks)
      .join("path")
      .attr("class", "link-path")
      .attr("fill", "none")
      .attr("stroke", "#CBD5E1")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)");

    // --- Link Labels ---
    const labelGroup = g.append("g").selectAll("g")
        .data(validLinks)
        .join("g")
        .attr("class", "cursor-pointer hover:opacity-80 transition-opacity")
        .on("click", (event: any, d: any) => {
            event.stopPropagation();
            onEditCondition(d.id, d.label);
        });

    const linkLabelRect = labelGroup.append("rect")
        .attr("width", 100)
        .attr("height", 20)
        .attr("fill", "#F8FAFC")
        .attr("rx", 10)
        .attr("stroke", "#E2E8F0")
        .attr("stroke-width", 1);
        
    const linkText = labelGroup.append("text")
      .text((d: any) => d.label)
      .attr("font-size", 9)
      .attr("fill", "#64748B")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .style("user-select", "none");

    // --- Edge Hover Hints (line + label highlight) ---
    linkGroup
      .on("mouseenter", function (event: any, d: any) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("stroke", "#6366F1")
          .attr("stroke-width", 3);

        labelGroup
          .filter((ld: any) => ld === d)
          .raise()
          .select("rect")
          .transition()
          .duration(120)
          .attr("fill", "#EEF2FF")
          .attr("stroke", "#6366F1");

        labelGroup
          .filter((ld: any) => ld === d)
          .select("text")
          .transition()
          .duration(120)
          .attr("fill", "#4F46E5");
      })
      .on("mouseleave", function (event: any, d: any) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("stroke", "#CBD5E1")
          .attr("stroke-width", 2);

        labelGroup
          .filter((ld: any) => ld === d)
          .select("rect")
          .transition()
          .duration(120)
          .attr("fill", "#F8FAFC")
          .attr("stroke", "#E2E8F0");

        labelGroup
          .filter((ld: any) => ld === d)
          .select("text")
          .transition()
          .duration(120)
          .attr("fill", "#64748B");
      });

    labelGroup
      .on("mouseenter", function (event: any, d: any) {
        labelGroup
          .filter((ld: any) => ld === d)
          .raise()
          .select("rect")
          .transition()
          .duration(120)
          .attr("fill", "#EEF2FF")
          .attr("stroke", "#6366F1");

        linkGroup
          .filter((ld: any) => ld === d)
          .transition()
          .duration(120)
          .attr("stroke", "#6366F1")
          .attr("stroke-width", 3);

        labelGroup
          .filter((ld: any) => ld === d)
          .select("text")
          .transition()
          .duration(120)
          .attr("fill", "#4F46E5");
      })
      .on("mouseleave", function (event: any, d: any) {
        labelGroup
          .filter((ld: any) => ld === d)
          .select("rect")
          .transition()
          .duration(120)
          .attr("fill", "#a0bcd8ff")
          .attr("stroke", "#E2E8F0");

        linkGroup
          .filter((ld: any) => ld === d)
          .transition()
          .duration(120)
          .attr("stroke", "#CBD5E1")
          .attr("stroke-width", 2);

        labelGroup
          .filter((ld: any) => ld === d)
          .select("text")
          .transition()
          .duration(120)
          .attr("fill", "#64748B");
      });

    // --- Drag Line (for linking mode) ---
    const dragLine = g.append("line")
        .attr("stroke", "#6366F1")
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "5,5")
        .attr("pointer-events", "none")
        .attr("opacity", 0);

    // --- Draw Nodes ---
    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "node-group")
      .style("cursor", "grab");

    // --- Drag Behavior Logic ---
    const dragBehavior = d3.drag()
        .on("start", function(event: any, d: any) {
            if (isLinkingRef.current) {
                // LINKING MODE: Start drawing line
                dragLine
                    .attr("x1", d.x).attr("y1", d.y)
                    .attr("x2", d.x).attr("y2", d.y)
                    .attr("opacity", 1);
            } else {
                // NORMAL MODE: Move node
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }
        })
        .on("drag", function(event: any, d: any) {
            if (isLinkingRef.current) {
                // Update line end
                dragLine.attr("x2", event.x).attr("y2", event.y);
            } else {
                d.fx = event.x;
                d.fy = event.y;
            }
        })
        .on("end", function(event: any, d: any) {
            if (isLinkingRef.current) {
                // Finish Link
                dragLine.attr("opacity", 0);
                
                // Find drop target (simple distance check)
                const mouseX = event.x;
                const mouseY = event.y;
                let targetId: string | null = null;
                
                // Check collision with other nodes
                nodes.forEach((n: any) => {
                    if (n.id !== d.id) {
                        // Approx hit box for node (rect is 200x80)
                        if (mouseX > n.x - 100 && mouseX < n.x + 100 &&
                            mouseY > n.y - 40 && mouseY < n.y + 40) {
                            targetId = n.id;
                        }
                    }
                });

                if (targetId && onLinkCreate) {
                    onLinkCreate(d.id, targetId);
                }
            } else {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        });

    nodeGroup.call(dragBehavior);

    // --- Agent Node Styling ---
    const agentNodes = nodeGroup.filter((d: any) => !d.isTool);

    agentNodes.append("rect")
      .attr("class", "node-rect")
      .attr("width", 200)
      .attr("height", 80)
      .attr("x", -100)
      .attr("y", -40)
      .attr("rx", 8)
      .attr("fill", "white")
      .on("click", (event: any, d: any) => {
          if (!isLinkingRef.current) {
            if (onNodeClick) onNodeClick(d.id);
            else onSelectAgent(d.id);
          }
      })
      .on("contextmenu", (event: any, d: any) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            agentId: d.id,
            isTool: false,
            promptFile: d.promptFile
          });
      });

    // Header Color Bar
    agentNodes.append("rect")
      .attr("width", 200)
      .attr("height", 6)
      .attr("x", -100)
      .attr("y", -40)
      .attr("rx", 4)
      .attr("fill", (d: any) => d.id === project.flow.entry_agent ? "#10B981" : "#6366F1")
      .attr("clip-path", "inset(0 0 4px 0)");

    // Agent Name
    agentNodes.append("text")
      .text((d: any) => d.name)
      .attr("x", -85)
      .attr("y", -10)
      .attr("text-anchor", "start")
      .attr("font-weight", "600")
      .attr("fill", "#1E293B")
      .attr("font-size", 14)
      .style("pointer-events", "none");

    // Agent Role
    agentNodes.append("text")
      .text((d: any) => d.role)
      .attr("x", -85)
      .attr("y", 10)
      .attr("text-anchor", "start")
      .attr("fill", "#64748B")
      .attr("font-size", 11)
      .style("pointer-events", "none");

    // Model Pill
    agentNodes.append("rect")
        .attr("x", -85)
        .attr("y", 18)
        .attr("width", 80)
        .attr("height", 16)
        .attr("rx", 4)
        .attr("fill", "#F1F5F9");
    
    agentNodes.append("text")
        .text((d: any) => d.modelName ? d.modelName.substring(0, 12) + '...' : 'model')
        .attr("x", -45)
        .attr("y", 29)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748B")
        .attr("font-size", 9)
        .style("pointer-events", "none");

    // --- Status Indicators ---
    agentNodes.each(function(this: any, d: any) {
        if (d.executionStatus && d.executionStatus !== 'idle') {
            const color = d.executionStatus === 'running' ? '#3B82F6' : // Blue
                          d.executionStatus === 'completed' ? '#10B981' : // Green
                          d.executionStatus === 'error' ? '#EF4444' : '#E2E8F0'; // Red
            
            if (d.executionStatus === 'running') {
                 // Pulse animation for running
                 d3.select(this).append("circle")
                    .attr("cx", 85).attr("cy", -25).attr("r", 6)
                    .attr("fill", color).attr("opacity", 0.3)
                    .append("animate").attr("attributeName", "r").attr("from", "6").attr("to", "12").attr("dur", "1s").attr("repeatCount", "indefinite");
                 
                 d3.select(this).append("animate").attr("attributeName", "opacity").attr("from", "0.5").attr("to", "0").attr("dur", "1s").attr("repeatCount", "indefinite");
            }

            d3.select(this).append("circle")
                .attr("cx", 85).attr("cy", -25).attr("r", 4)
                .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1.5);
        }
    });

    // ✅ Validation Badges (errors / warnings) – rode/gele bubbles linksboven
    agentNodes.each(function(this: any, d: any) {
      const errors = d.errorCount || 0;
      const warnings = d.warningCount || 0;

      if (!errors && !warnings) return;

      const hasErrors = errors > 0;

      const badge = d3.select(this)
        .append('g')
        .attr('class', 'validation-badge')
        .attr('transform', 'translate(-85,-32)');

      badge
        .append('circle')
        .attr('r', 9)
        .attr('fill', hasErrors ? '#FEE2E2' : '#FEF3C7')     // rood / geel achtergrond
        .attr('stroke', hasErrors ? '#EF4444' : '#F59E0B')   // rood / oranje rand
        .attr('stroke-width', 1.5);

      badge
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 9)
        .attr('font-weight', 600)
        .attr('fill', hasErrors ? '#B91C1C' : '#92400E')
        .text(hasErrors ? errors : warnings);
    });

    // --- Path Step Badge (small circle with step number) ---
    const badgeGroup = agentNodes
      .append('g')
      .attr('class', 'path-badge')
      .attr('transform', 'translate(85,-32)')
      .style('display', 'none');

    badgeGroup
      .append('circle')
      .attr('r', 9)
      .attr('fill', '#EEF2FF')
      .attr('stroke', '#6366F1')
      .attr('stroke-width', 1.5);

    badgeGroup
      .append('text')
      .attr('class', 'path-badge-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .attr('fill', '#4F46E5')
      .text('');

    // --- Tool Node Styling ---
    const toolNodes = nodeGroup.filter((d: any) => d.isTool);

    toolNodes.append("rect")
      .attr("class", "node-rect")
      .attr("width", 140)
      .attr("height", 40)
      .attr("x", -70)
      .attr("y", -20)
      .attr("rx", 20)
      .attr("fill", "#FFFBEB")
      .on("click", (event: any, d: any) => {
        if (!isLinkingRef.current) {
          if (onNodeClick) onNodeClick(d.id);
          else onSelectAgent(d.id);
        }
      })
      .on("contextmenu", (event: any, d: any) => {
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          agentId: d.id,
          isTool: true
        });
      });
      
    toolNodes.append("text").attr("x", -50).attr("y", 5).text("⚡").attr("font-size", 14);
    toolNodes.append("text").text((d: any) => d.name).attr("x", -30).attr("y", 5).attr("text-anchor", "start").attr("font-weight", "600").attr("fill", "#B45309").attr("font-size", 12).style("pointer-events", "none");

    // --- Hover Buttons ---
    const foreignObject = agentNodes.append("foreignObject")
      .attr("width", 120).attr("height", 30).attr("x", 40).attr("y", -65)
      .style("overflow", "visible").style("pointer-events", "none");

    const actionContainer = foreignObject.append("xhtml:div")
      .style("display", "flex").style("gap", "4px").style("opacity", "0").style("transition", "opacity 0.2s")
      .attr("class", "hover-actions pointer-events-auto");

    // Helper to create hover button
    const createHoverBtn = (svgContent: string, title: string, onClick: (d: any) => void) => {
        actionContainer.append("xhtml:button")
            .attr("title", title)
            .style("width", "24px").style("height", "24px").style("border-radius", "12px").style("background", "white").style("border", "1px solid #E2E8F0").style("color", " #475569").style("display", "flex").style("align-items", "center").style("justify-content", "center").style("cursor", "pointer").style("box-shadow", "0 2px 4px rgba(0,0,0,0.05)")
            .html(svgContent)
            .on("click", (e: any, d: any) => { e.stopPropagation(); onClick(d); });
    };

    createHoverBtn(
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`, 
        "Edit Prompt", (d) => onNavigateToPrompt && onNavigateToPrompt(d.promptFile)
    );
    createHoverBtn(
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        "Configure", (d) => onSelectAgent(d.id)
    );

    agentNodes.on("mouseenter", function(this: any) { d3.select(this).select(".hover-actions").style("opacity", "1"); })
              .on("mouseleave", function(this: any) { d3.select(this).select(".hover-actions").style("opacity", "0"); });

    // --- Simulation Tick ---
    simulation.on("tick", () => {
      linkGroup.attr("d", (d: any) => `M${(d.source as any).x},${(d.source as any).y} L${(d.target as any).x},${(d.target as any).y}`);
      
      linkLabelRect
          .attr("x", (d: any) => ((d.source as any).x + (d.target as any).x) / 2 - 50)
          .attr("y", (d: any) => ((d.source as any).y + (d.target as any).y) / 2 - 10);
          
      linkText
        .attr("x", (d: any) => ((d.source as any).x + (d.target as any).x) / 2)
        .attr("y", (d: any) => ((d.source as any).y + (d.target as any).y) / 2);

      nodeGroup.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
        simulation.stop();
        simulationRef.current = null;
    };
  }, [project.agents.length, project.flow.logic.length, project.flow.entry_agent, validationByAgentId]);

  // --- React Effect for Auto Zoom to Selected Node ---
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!svgRef.current || !zoomRef.current) return;

    const svg = d3.select(svgRef.current);
    const node = nodesRef.current.find((n: any) => n.id === selectedNodeId);
    if (!node) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const scale = 1.25;
    const targetX = width / 2 - node.x * scale;
    const targetY = height / 2 - node.y * scale;

    svg
      .transition()
      .duration(450)
      .call(
        (zoomRef.current as any).transform,
        d3.zoomIdentity.translate(targetX, targetY).scale(scale)
      );
  }, [selectedNodeId]);

  // --- React Effect for Small Flash on Selected Node ---
  useEffect(() => {
    if (!selectedNodeId || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const rect = svg
      .selectAll(".node-group")
      .filter((d: any) => d.id === selectedNodeId)
      .select(".node-rect");

    if (rect.empty()) return;

    // Kleine flash: kort wat dikkere stroke, dan terug naar 4
    rect
      .transition("flash")
      .duration(0)
      .attr("stroke-width", 6)
      .transition("flash")
      .duration(300)
      .attr("stroke-width", 4);
  }, [selectedNodeId]);

  // --- React Effect for Selections/Mode ---
  useEffect(() => {
      const svg = d3.select(svgRef.current);
      if (svg.empty()) return;

      // Node rectangles: selection, linking mode, and optional path highlight
      svg.selectAll(".node-rect")
          .attr("stroke", (d: any) => {
              const isOnPath =
                Array.isArray(highlightedNodeIds) &&
                highlightedNodeIds.includes(d.id);

              if (selectedNodeId === d.id) {
                  // Selected node always wins
                  return d.isTool ? "#D97706" : "#6366F1";
              }

              if (isOnPath) {
                  // Path-highlighted nodes get a stronger stroke
                  return d.isTool ? "#F59E0B" : "#6366F1";
              }

              if (isLinkingMode) {
                  return d.id === linkingSourceId ? "#6366F1" : "#E2E8F0";
              }

              if (d.isTool) return "#F59E0B";
              return "#E2E8F0";
          })
          .attr("stroke-width", (d: any) => {
              const isOnPath =
                Array.isArray(highlightedNodeIds) &&
                highlightedNodeIds.includes(d.id);

              if (selectedNodeId === d.id) return 4;
              if (isOnPath) return 3;
              if (linkingSourceId === d.id) return 4;
              return 1;
          })
          .style("filter", (d: any) => {
              const isOnPath =
                Array.isArray(highlightedNodeIds) &&
                highlightedNodeIds.includes(d.id);

              if (selectedNodeId === d.id) {
                  return d.isTool ? "url(#glow-amber)" : "url(#glow-indigo)";
              }

              if (isOnPath) {
                  return "url(#glow-indigo)";
              }

              return "url(#drop-shadow)";
          });

      svg.selectAll(".node-group").style("cursor", isLinkingMode ? "crosshair" : "grab");

      // Links: highlight either full path or local selection / linking
      svg.selectAll(".link-path")
        .attr("stroke", (d: any) => {
          const sourceId = (d.source as any)?.id ?? d.source;
          const targetId = (d.target as any)?.id ?? d.target;

          const hasPath =
            Array.isArray(highlightedEdges) && highlightedEdges.length > 0;

          const isInPath = hasPath
            ? highlightedEdges!.some(
                (e) => e.from === sourceId && e.to === targetId
              )
            : false;

          const isConnectedToSelected =
            !!selectedNodeId &&
            (sourceId === selectedNodeId || targetId === selectedNodeId);

          const isFromLinkingSource =
            !!isLinkingMode &&
            !!linkingSourceId &&
            sourceId === linkingSourceId;

          if (hasPath) {
            // When a full path is highlighted, prefer that
            return isInPath ? "#6366F1" : "#E2E8F0";
          }

          if (isLinkingMode && linkingSourceId) {
            return isFromLinkingSource ? "#6366F1" : "#E2E8F0";
          }

          if (isConnectedToSelected) {
            return "#6366F1";
          }

          return "#CBD5E1";
        })
        .attr("stroke-width", (d: any) => {
          const sourceId = (d.source as any)?.id ?? d.source;
          const targetId = (d.target as any)?.id ?? d.target;

          const hasPath =
            Array.isArray(highlightedEdges) && highlightedEdges.length > 0;

          const isInPath = hasPath
            ? highlightedEdges!.some(
                (e) => e.from === sourceId && e.to === targetId
              )
            : false;

          const isConnectedToSelected =
            !!selectedNodeId &&
            (sourceId === selectedNodeId || targetId === selectedNodeId);

          const isFromLinkingSource =
            !!isLinkingMode &&
            !!linkingSourceId &&
            sourceId === linkingSourceId;

          if (hasPath) {
            return isInPath ? 3 : 1.5;
          }

          if (isLinkingMode && linkingSourceId) {
            return isFromLinkingSource ? 3 : 1.5;
          }

          return isConnectedToSelected ? 3 : 2;
        })
        .attr("opacity", (d: any) => {
          const sourceId = (d.source as any)?.id ?? d.source;
          const targetId = (d.target as any)?.id ?? d.target;

          const hasPath =
            Array.isArray(highlightedEdges) && highlightedEdges.length > 0;

          const isInPath = hasPath
            ? highlightedEdges!.some(
                (e) => e.from === sourceId && e.to === targetId
              )
            : false;

          const isConnectedToSelected =
            !!selectedNodeId &&
            (sourceId === selectedNodeId || targetId === selectedNodeId);

          const isFromLinkingSource =
            !!isLinkingMode &&
            !!linkingSourceId &&
            sourceId === linkingSourceId;

          // Geen selectie / linking mode / path → alles normaal
          if (!selectedNodeId && !isLinkingMode && !hasPath) {
            return 1;
          }

          if (hasPath) {
            return isInPath ? 1 : 0.25;
          }

          if (isLinkingMode && linkingSourceId) {
            return isFromLinkingSource ? 1 : 0.35;
          }

          return isConnectedToSelected ? 1 : 0.35;
        });

      // --- Step badges: map highlightedNodeIds → 1,2,3,... per node
      const indexMap: Record<string, number> = {};
      const idList = Array.isArray(highlightedNodeIds) ? highlightedNodeIds : [];

      // Gebruik zowel agentId als agentName als sleutel
      nodesRef.current.forEach((node) => {
        const candidates = [node.id, node.name]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());

        const matchIndex = idList.findIndex((val) =>
          candidates.includes(String(val).toLowerCase())
        );

        if (matchIndex !== -1 && indexMap[node.id] == null) {
          indexMap[node.id] = matchIndex + 1;
        }
      });

      svg
        .selectAll('.path-badge')
        .style('display', (d: any) =>
          indexMap[d.id] != null && idList.length > 0 ? 'block' : 'none'
        );

      svg
        .selectAll('.path-badge-text')
        .text((d: any) => {
          const idx = indexMap[d.id];
          return idx != null ? String(idx) : '';
        });
  }, [selectedNodeId, isLinkingMode, linkingSourceId, highlightedNodeIds, highlightedEdges]);

  return (
    <div
      className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner h-full w-full relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      ></svg>
      
      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-xs text-slate-500 p-3 rounded-lg shadow-sm border border-slate-200 pointer-events-none select-none">
        <div className="flex items-center space-x-3">
             <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></span>Agent</span>
             <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>Tool</span>
             <span className="text-slate-300">|</span>
             <span className="font-medium text-slate-700">Right-click for Menu</span>
        </div>
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
            className="absolute bg-white rounded-lg shadow-2xl border border-slate-100 py-1 w-56 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
            style={{ left: contextMenu.x, top: contextMenu.y }}
        >
            <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 mb-1">
                {contextMenu.isTool ? 'Tool Options' : 'Agent Options'}
            </div>
            <button 
                onClick={() => { onSelectAgent(contextMenu.agentId); setContextMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            >
                Edit Configuration
            </button>
            {!contextMenu.isTool && (
                <>
                    <button 
                        onClick={() => { if(contextMenu.promptFile && onNavigateToPrompt) onNavigateToPrompt(contextMenu.promptFile); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                        Edit Prompt File
                    </button>
                    <button 
                        onClick={() => { if(onNavigateToTools) onNavigateToTools(); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                        Manage Tools
                    </button>
                </>
            )}
            <div className="border-t border-slate-100 my-1"></div>
            <button 
                onClick={() => setContextMenu(null)}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
                Close Menu
            </button>
        </div>
      )}
    </div>
  );
};

export default WorkflowGraph;
