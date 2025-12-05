import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TabBar from '../components/TabBar';

const createTab = (id, title, shellType = 'powershell') => ({
  id,
  title,
  shellConfig: {
    shellType,
    wslDistro: '',
    wslHomePath: '',
  },
  createdAt: Date.now(),
});

const defaultTabs = [
  createTab('tab-1', 'Terminal 1'),
  createTab('tab-2', 'Terminal 2'),
];

describe('TabBar', () => {
  describe('rendering', () => {
    it('should render all tabs', () => {
      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      expect(screen.getByText('Terminal 1')).toBeInTheDocument();
      expect(screen.getByText('Terminal 2')).toBeInTheDocument();
    });

    it('should render new tab button', () => {
      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: /new tab/i })).toBeInTheDocument();
    });

    it('should mark active tab correctly', () => {
      const { container } = render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-2"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      const tabs = container.querySelectorAll('.tab');
      expect(tabs[0]).not.toHaveClass('active');
      expect(tabs[1]).toHaveClass('active');
    });

    it('should render empty state with no tabs gracefully', () => {
      const { container } = render(
        <TabBar
          tabs={[]}
          activeTabId={null}
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      expect(container.querySelector('.tab-bar')).toBeInTheDocument();
      expect(container.querySelectorAll('.tab')).toHaveLength(0);
    });

    it('should have scrollable container class', () => {
      const { container } = render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      expect(container.querySelector('.tab-bar-scroll')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onTabClick when a tab is clicked', () => {
      const onTabClick = vi.fn();

      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      fireEvent.click(screen.getByText('Terminal 2'));
      expect(onTabClick).toHaveBeenCalledWith('tab-2');
    });

    it('should call onTabClose when tab close button is clicked', () => {
      const onTabClose = vi.fn();

      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={onTabClose}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeButtons[0]);
      expect(onTabClose).toHaveBeenCalledWith('tab-1');
    });

    it('should call onNewTab when new tab button is clicked', () => {
      const onNewTab = vi.fn();

      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={onNewTab}
          onReorder={() => {}}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /new tab/i }));
      expect(onNewTab).toHaveBeenCalledTimes(1);
    });

    it('should not call onTabClick when clicking close button', () => {
      const onTabClick = vi.fn();
      const onTabClose = vi.fn();

      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeButtons[0]);
      
      expect(onTabClose).toHaveBeenCalled();
      expect(onTabClick).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should disable new tab button when disabled prop is true', () => {
      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
          disableNewTab={true}
        />
      );

      const newTabButton = screen.getByRole('button', { name: /new tab/i });
      expect(newTabButton).toBeDisabled();
    });

    it('should not call onNewTab when button is disabled', () => {
      const onNewTab = vi.fn();

      render(
        <TabBar
          tabs={defaultTabs}
          activeTabId="tab-1"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={onNewTab}
          onReorder={() => {}}
          disableNewTab={true}
        />
      );

      const newTabButton = screen.getByRole('button', { name: /new tab/i });
      fireEvent.click(newTabButton);
      expect(onNewTab).not.toHaveBeenCalled();
    });
  });

  describe('many tabs', () => {
    it('should render many tabs', () => {
      const manyTabs = Array.from({ length: 10 }, (_, i) => 
        createTab(`tab-${i}`, `Terminal ${i + 1}`)
      );

      render(
        <TabBar
          tabs={manyTabs}
          activeTabId="tab-0"
          onTabClick={() => {}}
          onTabClose={() => {}}
          onNewTab={() => {}}
          onReorder={() => {}}
        />
      );

      expect(screen.getByText('Terminal 1')).toBeInTheDocument();
      expect(screen.getByText('Terminal 10')).toBeInTheDocument();
    });
  });
});
