import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

interface WorkflowGraphProps {
  project: any;

  // Node selection / click (App.tsx compat)
  onSelectAgent?: (agentId: string) => void;
  onNodeClick?: (agentId: string) => void;
  selectedNodeId?: string | null;

  // Link/edge selection + editing (App.tsx compat)
  selectedLinkId?: string | null;
  onSelectLink?: (linkId: string | null) => void;
  onEditCondition?: (linkId: string, condition: string) => any;

  // Linking mode (App.tsx compat)
  isLinkingMode?: boolean;
  linkingSourceId?: string | null;
  onLinkCreate?: (sourceId: string, targetId: string) => void;

  // Navigation (App.tsx compat)
  onNavigateToPrompt?: (filename: string) => void;
  onNavigateToTools?: () => void;

  // Highlights / validation (App.tsx compat)
  highlightedNodeIds?: string[];
  highlightedEdges?: { from: string; to: string }[];
  validationByAgentId?: Record<string, { errors: number; warnings: number }>;

  // Edge status for badges/colors
  edgeStatusByLinkId?: Record<string, 'ok' | 'autofix' | 'error' | 'missing_owner'>;
}

type MenuState =
  | { open: false }
  | {
      open: true;
      x: number;
      y: number;
      kind: 'node' | 'canvas' | 'edge';
      nodeId?: string;
      linkId?: string;
    };

export default function WorkflowGraph({
  project,
  onSelectAgent,
  onNodeClick,
  selectedNodeId,
  selectedLinkId,
  onSelectLink,
  onEditCondition,
  isLinkingMode,
  linkingSourceId,
  onLinkCreate,
  onNavigateToPrompt,
  onNavigateToTools,
  highlightedNodeIds,
  highlightedEdges,
  validationByAgentId,
  edgeStatusByLinkId,
}: WorkflowGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [menu, setMenu] = useState<MenuState>({ open: false });

  const EDGE_COLORS: Record<'ok' | 'autofix' | 'error' | 'missing_owner', string> = {
    ok: '#2563eb', // blue
    autofix: '#f59e0b', // amber
    error: '#ef4444', // red
    missing_owner: '#6b7280', // slate
  };

  const getEdgeStatus = (linkId: string): 'ok' | 'autofix' | 'error' | 'missing_owner' | undefined => {
    if (!edgeStatusByLinkId) return undefined;
    return edgeStatusByLinkId[linkId];
  };

  const getBadgeWidth = (status: any): number => {
    if (!status) return 0;
    return status === 'missing_owner' ? 92 : 46;
  };

  const getBadgeLabel = (status: any): string => {
    if (!status) return '';
    if (status === 'ok') return 'OK';
    if (status === 'autofix') return 'FIX';
    if (status === 'missing_owner') return 'Needs owner';
    return 'ERR';
  };

  const getBadgeTitle = (status: any): string => {
    if (status === 'missing_owner') return 'Decision point: choose AI or Human in Edit Logic Link.';
    return '';
  };



  const handleSelectAgent = (agentId: string) => {
    // Prefer App.tsx click handler (linking-mode aware)
    if (onNodeClick) return onNodeClick(agentId);
    if (onSelectAgent) return onSelectAgent(agentId);
  };

  const getAgentId = (node: any) => node?.id ?? node?.agentId ?? node?.name;

  // Normalize links from your project shape (primary: project.flow.logic)
  const normalizeLinks = (p: any) => {
    const raw = p?.flow?.logic ?? p?.logic_links ?? p?.links ?? p?.flow?.links ?? [];
    if (!Array.isArray(raw)) return [];

    return raw.map((l: any, idx: number) => {
      const from = l.from ?? l.source ?? l.fromAgentId ?? l.from_agent_id;
      const to = l.to ?? l.target ?? l.toAgentId ?? l.to_agent_id;

      return {
        ...l,
        __index: idx,
        id: l.id ?? `${from}__${to}__${idx}`,
        source: from,
        target: to,
        condition: l.condition ?? l.rule ?? l.expression ?? l.label ?? '',
      };
    });
  };

  // Close menu on outside click / ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu({ open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nodesMemo = useMemo(() => {
    return (project?.agents || []).map((a: any) => ({
      ...a,
      id: a.id ?? a.name,
    }));
  }, [project]);

  const linksMemo = useMemo(() => normalizeLinks(project), [project]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 1200;
    const height = 800;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const defs = svg.append('defs');

    // Drop shadow
    const filter = defs.append('filter').attr('id', 'dropShadow').attr('height', '130%');
    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur');
    filter.append('feOffset').attr('in', 'blur').attr('dx', 0).attr('dy', 2).attr('result', 'offsetBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'offsetBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const nodes = nodesMemo;
    const links = linksMemo;

    const g = svg.append('g');

    // ✅ Zoom/pan — FILTERED so zoom != drag
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2])
      .filter((event: any) => {
        // Allow wheel zoom always
        if (event.type === 'wheel') return true;

        // Block zoom/pan when interacting with nodes/labels
        const target = event.target as Element | null;
        if (target) {
          if (target.closest?.('.nodes')) return false;
          if (target.closest?.('.link-label-rects')) return false;
          if (target.closest?.('.links')) return false;
        }

        // Only left mouse button for pan
        if (event.type === 'mousedown') return event.button === 0;

        return true;
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom as any);

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(links as any)
          .id((d: any) => d.id)
          .distance(220),
      )
      .force('charge', d3.forceManyBody().strength(-700))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(80));

    // --- Links ---
    const linkGroup = g
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(links as any)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke-width', (d: any) => (selectedLinkId && d.id === selectedLinkId ? 4 : 2))
      .attr('stroke', (d: any) => {
        const status = getEdgeStatus(d.id);
        return status ? EDGE_COLORS[status] : '#2563eb';
      })
      .attr('opacity', 0.9)
      .style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        setMenu({ open: false });
        onSelectLink?.(d.id);
      })
      .on('contextmenu', (event: any, d: any) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenu({
          open: true,
          kind: 'edge',
          linkId: d.id,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      });

    // --- Link label background rect ---
    const linkLabelRect = g
      .append('g')
      .attr('class', 'link-label-rects')
      .selectAll('rect')
      .data(links as any)
      .enter()
      .append('rect')
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('width', 120)
      .attr('height', 22)
      .attr('fill', '#ffffff')
      .attr('stroke', (d: any) => (selectedLinkId && d.id === selectedLinkId ? '#2563eb' : '#e5e7eb'))
      .attr('stroke-width', (d: any) => (selectedLinkId && d.id === selectedLinkId ? 2 : 1))
      .attr('filter', 'url(#dropShadow)')
      .style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        setMenu({ open: false });
        onSelectLink?.(d.id);
      })
      .on('dblclick', (event: any, d: any) => {
        event.stopPropagation();
        setMenu({ open: false });
        onEditCondition?.(d.id, (d.condition ?? '').toString());
      })
      .on('contextmenu', (event: any, d: any) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMenu({
          open: true,
          kind: 'edge',
          linkId: d.id,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      });

    // --- Link label text ---
    const linkText = g
      .append('g')
      .attr('class', 'link-text')
      .selectAll('text')
      .data(links as any)
      .enter()
      .append('text')
      .text((d: any) => {
        const cond = (d.condition ?? '').toString();
        return cond.length > 18 ? cond.slice(0, 18) + '…' : cond;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#111827')
      .style('pointer-events', 'none');

    // --- Badge group per link (edge status) ---
    const linkBadgeGroup = g
      .append('g')
      .attr('class', 'link-badges')
      .selectAll('g')
      .data(links as any)
      .enter()
      .append('g')
      .style('pointer-events', 'none');

    // Tooltip (beginner-friendly)
    linkBadgeGroup.append('title').text((d: any) => getBadgeTitle(getEdgeStatus(d.id)));


    linkBadgeGroup
      .append('rect')
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('width', (d: any) => getBadgeWidth(getEdgeStatus(d.id)))
      .attr('height', 18)
      .attr('y', -9)
      .attr('x', 72)
      .attr('fill', (d: any) => {
        const status = getEdgeStatus(d.id);
        return status ? EDGE_COLORS[status] : 'transparent';
      })
      .attr('opacity', (d: any) => (getEdgeStatus(d.id) ? 1 : 0));

    linkBadgeGroup
      .append('text')
      .attr('x', (d: any) => 72 + getBadgeWidth(getEdgeStatus(d.id)) / 2)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 10)
      .attr('font-weight', 700)
      .attr('fill', '#ffffff')
      .text((d: any) => getBadgeLabel(getEdgeStatus(d.id)))
      .attr('opacity', (d: any) => (getEdgeStatus(d.id) ? 1 : 0));

    // --- Nodes ---
    const nodeGroup = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes as any)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .on('contextmenu', (event: any, d: any) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const id = getAgentId(d);
        if (!id) return;

        // Select node on right click (matches your expected UX)
        onSelectAgent?.(id);

        setMenu({
          open: true,
          kind: 'node',
          nodeId: id,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      })
      .call(
        d3
          .drag<any, any>()
          .on('start', (event: any, d: any) => {
            // ✅ stop zoom/pan from hijacking
            event.sourceEvent?.stopPropagation?.();

            setMenu({ open: false });

            if (!event.active) simulation.alphaTarget(0.3).restart();
            // if node was already fixed, keep it
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: any) => {
            event.sourceEvent?.stopPropagation?.();
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: any) => {
            event.sourceEvent?.stopPropagation?.();
            if (!event.active) simulation.alphaTarget(0);

            // ✅ Keep position after drag (no spring-back)
            d.fx = d.x;
            d.fy = d.y;
          }) as any,
      )
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        setMenu({ open: false });
        const id = getAgentId(d);
        if (id) handleSelectAgent(id);
      });

    nodeGroup
      .append('rect')
      .attr('x', -90)
      .attr('y', -30)
      .attr('width', 180)
      .attr('height', 60)
      .attr('rx', 12)
      .attr('ry', 12)
      .attr('fill', '#ffffff')
      .attr('stroke', (d: any) => {
        const id = getAgentId(d);
        const summary = id && validationByAgentId ? validationByAgentId[id] : undefined;

        if (selectedNodeId && id === selectedNodeId) return '#2563eb';

        if (!summary) return '#e5e7eb';
        if (summary.errors > 0) return '#ef4444';
        if (summary.warnings > 0) return '#f59e0b';
        return '#e5e7eb';
      })
      .attr('stroke-width', (d: any) => {
        const id = getAgentId(d);
        if (selectedNodeId && id === selectedNodeId) return 3;
        return 2;
      })
      .attr('filter', 'url(#dropShadow)');

    nodeGroup
      .append('text')
      .attr('x', -75)
      .attr('y', -8)
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .attr('fill', '#111827')
      .text((d: any) => d.name ?? d.id ?? 'Agent');

    nodeGroup
      .append('text')
      .attr('x', -75)
      .attr('y', 10)
      .attr('font-size', 11)
      .attr('fill', '#6b7280')
      .text((d: any) => d.role ?? '');

    nodeGroup
      .append('text')
      .attr('x', -75)
      .attr('y', 26)
      .attr('font-size', 10)
      .attr('fill', '#9ca3af')
      .text((d: any) => {
        const m = d.model;
        if (!m) return '';
        if (typeof m === 'string') return m;
        if (typeof m === 'object') return m.name ?? '';
        return '';
      });

    // Background click: close menu + deselect link
    svg.on('click', () => {
      setMenu({ open: false });
      onSelectLink?.(null);
    });

    // Background context menu
    svg.on('contextmenu', (event: any) => {
      // only when right-clicking true background (not node/link, they stopPropagation)
      event.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenu({
        open: true,
        kind: 'canvas',
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    });

    // --- Tick ---
    simulation.on('tick', () => {
      linkGroup.attr(
        'd',
        (d: any) => `M${(d.source as any).x},${(d.source as any).y} L${(d.target as any).x},${(d.target as any).y}`,
      );

      linkLabelRect
        .attr('x', (d: any) => ((d.source as any).x + (d.target as any).x) / 2 - 60)
        .attr('y', (d: any) => ((d.source as any).y + (d.target as any).y) / 2 - 10);

      linkText
        .attr('x', (d: any) => ((d.source as any).x + (d.target as any).x) / 2)
        .attr('y', (d: any) => ((d.source as any).y + (d.target as any).y) / 2);

      linkBadgeGroup.attr('transform', (d: any) => {
        const mx = ((d.source as any).x + (d.target as any).x) / 2;
        const my = ((d.source as any).y + (d.target as any).y) / 2;
        return `translate(${mx},${my})`;
      });

      nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [
    nodesMemo,
    linksMemo,
    validationByAgentId,
    selectedLinkId,
    selectedNodeId,
    onSelectLink,
    edgeStatusByLinkId,
    onEditCondition,
    onSelectAgent,
  ]);

  const selectedNode = useMemo(() => {
    if (!menu.open || menu.kind !== 'node' || !menu.nodeId) return null;
    return (project?.agents || []).find((a: any) => (a?.id ?? a?.name) === menu.nodeId) ?? null;
  }, [menu, project]);

  const selectedEdge = useMemo(() => {
    if (!menu.open || menu.kind !== 'edge' || !menu.linkId) return null;
    return (project?.flow?.logic || []).find((l: any) => (l?.id ?? null) === menu.linkId) ?? null;
  }, [menu, project]);

  // ✅ C.3.3 Legend visibility (only when there is an active highlighted route)
  const hasActiveRoute = Array.isArray(highlightedEdges) && highlightedEdges.length > 0;


  return (
    <div
      ref={wrapperRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseDown={() => {
        // click outside menu closes it
        if (menu.open) setMenu({ open: false });
      }}
    >
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />

      {menu.open && (
        <div
          style={{
            position: 'absolute',
            left: menu.x,
            top: menu.y,
            minWidth: 220,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            zIndex: 50,
            padding: 6,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.kind === 'node' && selectedNode && (
            <>
              <div style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>
                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>{selectedNode.name}</div>
                <div>{selectedNode.role}</div>
              </div>
              <div style={{ height: 1, background: '#f1f5f9', margin: '6px 0' }} />

              <button
                style={menuItemStyle}
                onClick={() => {
                  setMenu({ open: false });
                  if (menu.nodeId) handleSelectAgent(menu.nodeId);
                }}
              >
                Select
              </button>

              {selectedNode.prompt && onNavigateToPrompt && (
                <button
                  style={menuItemStyle}
                  onClick={() => {
                    setMenu({ open: false });
                    onNavigateToPrompt(selectedNode.prompt);
                  }}
                >
                  Open prompt file
                </button>
              )}

              {selectedNode.role === 'Tool' && onNavigateToTools && (
                <button
                  style={menuItemStyle}
                  onClick={() => {
                    setMenu({ open: false });
                    onNavigateToTools();
                  }}
                >
                  Open tools registry
                </button>
              )}

              {isLinkingMode && menu.nodeId && (
                <button
                  style={menuItemStyle}
                  onClick={() => {
                    setMenu({ open: false });
                    // In your App.tsx: first click sets linkingSourceId
                    onNodeClick?.(menu.nodeId);
                  }}
                >
                  Set as link source
                </button>
              )}
            </>
          )}

          {menu.kind === 'edge' && selectedEdge && (
            <>
              <div style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>
                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>Logic link</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {(selectedEdge.condition ?? 'always').toString()}
                </div>
              </div>
              <div style={{ height: 1, background: '#f1f5f9', margin: '6px 0' }} />

              <button
                style={menuItemStyle}
                onClick={() => {
                  setMenu({ open: false });
                  if (menu.linkId) onSelectLink?.(menu.linkId);
                }}
              >
                Select link
              </button>

              <button
                style={menuItemStyle}
                onClick={() => {
                  setMenu({ open: false });
                  if (menu.linkId) onEditCondition?.(menu.linkId, (selectedEdge.condition ?? '').toString());
                }}
              >
                Edit condition
              </button>
            </>
          )}

          {menu.kind === 'canvas' && (
            <>
              <div style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>
                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>Canvas</div>
                <div>Right-click menu</div>
              </div>
              <div style={{ height: 1, background: '#f1f5f9', margin: '6px 0' }} />
              <button
                style={menuItemStyle}
                onClick={() => {
                  setMenu({ open: false });
                  onSelectLink?.(null);
                  // keep node selection as-is (matches “respect existing UX”)
                }}
              >
                Clear link selection
              </button>
            </>
          )}
        </div>
      )}

{/* ✅ Legend (read-only). Always visible; becomes “active” when a route is highlighted. */}
<div
  style={{
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 5,
    background: 'rgba(255,255,255,0.90)',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '8px 10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: 12,
    color: '#111827',
    lineHeight: 1.25,
    pointerEvents: 'none',
    opacity: hasActiveRoute ? 1 : 0.55,
  }}
>
  <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>Legend</div>

  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: '#374151' }}>
    <div style={{ width: 18, height: 3, background: '#2563eb', borderRadius: 2 }} />
    <div>Active route</div>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
    <div style={{ width: 18, height: 3, background: '#2563eb', opacity: 0.22, borderRadius: 2 }} />
    <div>Other routes</div>
  </div>

  {!hasActiveRoute && (
    <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
      Select a trace step to highlight a route.
    </div>
  )}
</div>


    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '10px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};
