/**
 * SPACEBAR DEBUG SCRIPT
 * Paste this into browser console to diagnose spacebar issues
 */

console.clear();
console.log('%c=== SPACEBAR DEBUG MODE ===', 'color: cyan; font-size: 16px; font-weight: bold');
console.log('This will capture the next 10 keyboard events and show what happens to Space');

let eventCount = 0;
const maxEvents = 10;

const captureHandler = (e) => {
  eventCount++;
  
  if (e.code === 'Space' || e.key === ' ') {
    console.log('%c🔴 SPACE KEY DETECTED', 'color: red; font-weight: bold');
  } else {
    console.log(`📝 Key: ${e.key}`);
  }
  
  console.log({
    eventNumber: eventCount,
    type: e.type,
    key: e.key,
    code: e.code,
    target: e.target.tagName,
    targetClass: e.target.className,
    activeElement: document.activeElement?.tagName,
    activeElementClass: document.activeElement?.className,
    defaultPrevented: e.defaultPrevented,
    isTrusted: e.isTrusted,
    timeStamp: e.timeStamp
  });
  
  if (eventCount >= maxEvents) {
    window.removeEventListener('keydown', captureHandler, true);
    console.log('%c=== CAPTURE COMPLETE ===', 'color: green; font-size: 16px; font-weight: bold');
    console.log('Summary:');
    console.log('- Check if Space events show defaultPrevented: true');
    console.log('- Check if activeElement is xterm-helper-textarea');
    console.log('- Check if target is TEXTAREA');
  }
};

window.addEventListener('keydown', captureHandler, true);

// Also check current state
console.log('\n%c📊 CURRENT STATE:', 'color: yellow; font-weight: bold');
console.log({
  textareaCount: document.querySelectorAll('.xterm-helper-textarea').length,
  activeElement: document.activeElement?.tagName,
  activeElementClass: document.activeElement?.className,
  focusedElement: document.querySelector(':focus')?.tagName
});

console.log('\n💡 Now press some keys including Space. Monitoring...');
