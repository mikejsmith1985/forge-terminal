// Debug script to inject into browser console
// Run this at http://localhost:9999 with F12 open

function debugTerminalDimensions() {
    console.log('=== TERMINAL DIMENSION DEBUG ===');
    
    const tabs = document.querySelectorAll('.tab-button');
    const terminalWrappers = document.querySelectorAll('.terminal-wrapper');
    
    console.log(`Found ${tabs.length} tabs, ${terminalWrappers.length} terminal wrappers`);
    
    terminalWrappers.forEach((wrapper, index) => {
        const isHidden = wrapper.classList.contains('hidden');
        const terminal = wrapper.querySelector('.terminal');
        const xtermScreen = wrapper.querySelector('.xterm-screen');
        const xtermViewport = wrapper.querySelector('.xterm-viewport');
        
        console.log(`\nTab ${index + 1} (${isHidden ? 'HIDDEN' : 'VISIBLE'}):`);
        
        if (terminal) {
            const termRect = terminal.getBoundingClientRect();
            console.log(`  Terminal:`, {
                width: termRect.width,
                height: termRect.height,
                left: termRect.left,
                top: termRect.top,
                right: termRect.right
            });
        }
        
        if (xtermScreen) {
            const screenRect = xtermScreen.getBoundingClientRect();
            console.log(`  XTerm Screen:`, {
                width: screenRect.width,
                height: screenRect.height,
                left: screenRect.left
            });
        }
        
        if (xtermViewport) {
            const viewportRect = xtermViewport.getBoundingClientRect();
            console.log(`  XTerm Viewport:`, {
                width: viewportRect.width,
                height: viewportRect.height,
                left: viewportRect.left,
                scrollLeft: xtermViewport.scrollLeft
            });
        }
        
        // Check wrapper dimensions
        const wrapperRect = wrapper.getBoundingClientRect();
        console.log(`  Wrapper:`, {
            width: wrapperRect.width,
            height: wrapperRect.height,
            display: window.getComputedStyle(wrapper).display,
            position: window.getComputedStyle(wrapper).position
        });
    });
    
    console.log('\n=== END DEBUG ===');
}

// Run immediately
debugTerminalDimensions();

// Also expose globally for manual runs
window.debugTerminalDimensions = debugTerminalDimensions;

console.log('Run debugTerminalDimensions() after switching tabs to see dimensions');
