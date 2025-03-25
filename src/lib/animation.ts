/**
 * Animation utilities to improve performance and smoothness
 */

const TRANSFORM_PROPERTIES = [
  'transform',
  'translate3d(0,0,0)',
  'translateZ(0)',
  'scale3d(1, 1, 1)',
  'rotate3d(0, 0, 1, 0deg)',
];

const WILL_CHANGE_PROPERTIES = [
  'transform',
  'opacity',
];

/**
 * Apply hardware acceleration to an element
 * @param element - DOM element to optimize
 */
export function applyHardwareAcceleration(element: HTMLElement): void {
  if (!element) return;
  
  // Apply CSS transform to force GPU rendering
  TRANSFORM_PROPERTIES.forEach(prop => {
    if (prop.includes(':')) {
      const [key, value] = prop.split(':');
      element.style.setProperty(key.trim(), value.trim());
    } else {
      element.style.setProperty('transform', 'translateZ(0)');
    }
  });
  
  // Set will-change property to hint the browser
  element.style.setProperty('will-change', WILL_CHANGE_PROPERTIES.join(', '));
  
  // Other optimization properties
  element.style.setProperty('backface-visibility', 'hidden');
}

/**
 * Time conversion helpers
 */
export const DURATION = {
  fast: 150, // ms
  normal: 250, // ms
  slow: 400, // ms
};

/**
 * Easing functions
 */
export const EASING = {
  // Material Design inspired easings
  standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  // Spring-like motion
  bounce: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  // Smooth animations
  smoothIn: 'cubic-bezier(0.4, 0, 0.6, 1)',
  smoothOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  smoothInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

/**
 * Apply preferred timing for better animations
 * @param element - DOM element to optimize
 * @param property - CSS property to animate
 * @param duration - Duration in ms
 * @param easing - Easing function
 */
export function applyOptimizedTiming(
  element: HTMLElement,
  property: string = 'all',
  duration: number = DURATION.normal,
  easing: string = EASING.standard
): void {
  if (!element) return;
  
  element.style.setProperty('transition-property', property);
  element.style.setProperty('transition-duration', `${duration}ms`);
  element.style.setProperty('transition-timing-function', easing);
}

/**
 * Check if the browser supports motion reduction
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply reduced motion settings if user prefers it
 * @param element - DOM element to adjust
 */
export function applyMotionPreference(element: HTMLElement): void {
  if (prefersReducedMotion() && element) {
    element.style.setProperty('transition-duration', '0.01ms');
    element.style.setProperty('animation-duration', '0.01ms');
    element.style.setProperty('animation-iteration-count', '1');
  }
}
