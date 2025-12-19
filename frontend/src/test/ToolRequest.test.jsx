import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ToolRequest from '../components/AssistantPanel/ToolRequest';

describe('ToolRequest', () => {
  it('should render tool details', () => {
    const params = { path: '.' };
    render(<ToolRequest tool="ls" params={params} onApprove={vi.fn()} onDeny={vi.fn()} />);
    
    expect(screen.getByText('Tool Request: ls')).toBeInTheDocument();
    // Use a more flexible matcher for JSON content which might have whitespace differences
    expect(screen.getByText((content, element) => {
      return element.tagName.toLowerCase() === 'div' && content.includes('"path": "."');
    })).toBeInTheDocument();
  });

  it('should call onApprove when approved', () => {
    const onApprove = vi.fn();
    render(<ToolRequest tool="ls" params={{}} onApprove={onApprove} onDeny={vi.fn()} />);
    
    fireEvent.click(screen.getByText('Allow'));
    expect(onApprove).toHaveBeenCalled();
  });

  it('should call onDeny when denied', () => {
    const onDeny = vi.fn();
    render(<ToolRequest tool="ls" params={{}} onApprove={vi.fn()} onDeny={onDeny} />);
    
    fireEvent.click(screen.getByText('Deny'));
    expect(onDeny).toHaveBeenCalled();
  });
});
