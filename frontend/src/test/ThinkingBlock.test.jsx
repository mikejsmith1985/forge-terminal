import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ThinkingBlock from '../components/AssistantPanel/ThinkingBlock';

describe('ThinkingBlock', () => {
  it('should render thinking content', () => {
    render(<ThinkingBlock content="Analyzing file structure..." />);
    expect(screen.getByText('Thinking Process')).toBeInTheDocument();
    // Content is hidden by default
    expect(screen.queryByText('Analyzing file structure...')).not.toBeInTheDocument();
  });

  it('should toggle visibility on click', () => {
    render(<ThinkingBlock content="Analyzing file structure..." />);
    
    const header = screen.getByText('Thinking Process');
    fireEvent.click(header);
    
    expect(screen.getByText('Analyzing file structure...')).toBeInTheDocument();
    
    fireEvent.click(header);
    expect(screen.queryByText('Analyzing file structure...')).not.toBeInTheDocument();
  });
});
