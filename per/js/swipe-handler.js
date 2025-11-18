"use strict";

import { toast } from "./ui.js";

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

export function initSwipeHandler(element, callbacks = {}) {
  if (!element) return;

  const {
    onSwipeLeft = null,
    onSwipeRight = null,
    onSwipeUp = null,
    onSwipeDown = null,
    threshold = 50
  } = callbacks;

  element.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  element.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }
    } else {
      // Vertical swipe
      if (Math.abs(deltaY) > threshold) {
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown();
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp();
        }
      }
    }
  }
}

export function initItemSwipe(itemElement, onDelete, onArchive) {
  if (!itemElement) return;

  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  itemElement.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
    itemElement.style.transition = 'none';
  });

  itemElement.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    if (Math.abs(diff) > 10) {
      e.preventDefault();
      itemElement.style.transform = `translateX(${diff}px)`;
    }
  });

  itemElement.addEventListener('touchend', () => {
    if (!isDragging) return;
    
    isDragging = false;
    const diff = currentX - startX;
    
    itemElement.style.transition = 'transform 0.3s ease';
    
    if (diff < -100 && onDelete) {
      // Swipe left - delete
      itemElement.style.transform = 'translateX(-100%)';
      setTimeout(() => {
        onDelete();
      }, 300);
    } else if (diff > 100 && onArchive) {
      // Swipe right - archive
      itemElement.style.transform = 'translateX(100%)';
      setTimeout(() => {
        onArchive();
      }, 300);
    } else {
      // Reset
      itemElement.style.transform = 'translateX(0)';
    }
  });
}

export default { initSwipeHandler, initItemSwipe };
