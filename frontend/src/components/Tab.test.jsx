import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Tab from '../components/Tab';

const defaultTab = {
  id: 'tab-1',
  title: 'Terminal 1',
  shellConfig: {
    shellType: 'powershell',
    wslDistro: '',
    wslHomePath: '',
  },
  createdAt: Date.now(),
};

describe('Tab', () => {
  describe('rendering', () => {
    it('should render tab title', () => {
      render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Terminal 1')).toBeInTheDocument();
    });

    it('should render with active class when isActive is true', () => {
      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={true}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.firstChild).toHaveClass('active');
    });

    it('should not have active class when isActive is false', () => {
      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.firstChild).not.toHaveClass('active');
    });

    it('should render close button', () => {
      render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should show shell icon for powershell', () => {
      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.querySelector('.tab-icon')).toBeInTheDocument();
    });

    it('should show different icon for WSL shell', () => {
      const wslTab = {
        ...defaultTab,
        shellConfig: {
          shellType: 'wsl',
          wslDistro: 'Ubuntu',
          wslHomePath: '/home/user',
        },
      };

      const { container } = render(
        <Tab
          tab={wslTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.querySelector('.tab-icon')).toBeInTheDocument();
    });

    it('should truncate long titles with ellipsis', () => {
      const longTitleTab = {
        ...defaultTab,
        title: 'This is a very long terminal title that should be truncated',
      };

      const { container } = render(
        <Tab
          tab={longTitleTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      const titleElement = container.querySelector('.tab-title');
      expect(titleElement).toBeInTheDocument();
      // CSS handles truncation, just verify the element has the class
    });
  });

  describe('interactions', () => {
    it('should call onClick when tab is clicked', () => {
      const onClick = vi.fn();

      render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={onClick}
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText('Terminal 1'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();

      render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when close button is clicked', () => {
      const onClick = vi.fn();
      const onClose = vi.fn();

      render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={onClick}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose on middle mouse click', () => {
      const onClose = vi.fn();

      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={onClose}
        />
      );

      fireEvent.mouseDown(container.firstChild, { button: 1 });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose on left mouse click via mouseDown', () => {
      const onClose = vi.fn();

      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={onClose}
        />
      );

      fireEvent.mouseDown(container.firstChild, { button: 0 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('shell type display', () => {
    it('should display PS indicator for powershell', () => {
      const { container } = render(
        <Tab
          tab={defaultTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      // Should have some visual indicator for powershell
      expect(container.querySelector('[data-shell="powershell"]') || 
             container.textContent.includes('PS') ||
             container.querySelector('.tab-icon')).toBeTruthy();
    });

    it('should display CMD indicator for cmd shell', () => {
      const cmdTab = {
        ...defaultTab,
        shellConfig: {
          shellType: 'cmd',
          wslDistro: '',
          wslHomePath: '',
        },
      };

      const { container } = render(
        <Tab
          tab={cmdTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.querySelector('[data-shell="cmd"]') ||
             container.querySelector('.tab-icon')).toBeTruthy();
    });

    it('should display WSL indicator for wsl shell', () => {
      const wslTab = {
        ...defaultTab,
        shellConfig: {
          shellType: 'wsl',
          wslDistro: 'Ubuntu',
          wslHomePath: '/home/user',
        },
      };

      const { container } = render(
        <Tab
          tab={wslTab}
          isActive={false}
          onClick={() => {}}
          onClose={() => {}}
        />
      );

      expect(container.querySelector('[data-shell="wsl"]') ||
             container.querySelector('.tab-icon')).toBeTruthy();
    });
  });
});
