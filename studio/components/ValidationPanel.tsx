// studio/components/ValidationPanel.tsx
import React from 'react';
import type { ValidationIssue } from '../../runtime/core/validator';

interface ValidationPanelProps {
  issues: ValidationIssue[];
  onClose?: () => void;
}

const levelColor: Record<ValidationIssue['level'], string> = {
  error: '#fee2e2',   // licht rood
  warning: '#fef9c3', // licht geel
};

const levelLabel: Record<ValidationIssue['level'], string> = {
  error: 'Error',
  warning: 'Warning',
};

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  issues,
  onClose,
}) => {
  const hasErrors = issues.some((i) => i.level === 'error');

  return (
    <div
      style={{
        borderLeft: '1px solid #e5e7eb',
        padding: '16px',
        width: '360px',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#fafafa',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Validation</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {issues.length === 0
              ? 'No issues found.'
              : `${issues.length} issue${issues.length === 1 ? '' : 's'} (${issues.filter(i => i.level === 'error').length} errors, ${issues.filter(i => i.level === 'warning').length} warnings)`}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close validation panel"
          >
            ×
          </button>
        )}
      </div>

      {issues.length === 0 ? (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: '#ecfdf3',
            fontSize: 13,
            color: '#166534',
          }}
        >
          ✅ Project is valid. No structural issues detected.
        </div>
      ) : (
        <>
          {hasErrors && (
            <div
              style={{
                marginBottom: 8,
                padding: 8,
                borderRadius: 6,
                background: '#fee2e2',
                fontSize: 12,
                color: '#991b1b',
              }}
            >
              Project contains validation errors. Fix these before running the
              flow.
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {issues.map((issue, index) => (
              <div
                key={index}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: levelColor[issue.level],
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: issue.level === 'error' ? '#b91c1c' : '#92400e',
                    }}
                  >
                    {levelLabel[issue.level]} · {issue.code}
                  </span>
                  {issue.path && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        color: '#4b5563',
                        marginLeft: 8,
                      }}
                    >
                      {issue.path}
                    </span>
                  )}
                </div>
                <div style={{ color: '#111827', lineHeight: 1.4 }}>
                  {issue.message}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ValidationPanel;
