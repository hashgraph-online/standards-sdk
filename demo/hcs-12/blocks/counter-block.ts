/**
 * Counter Block for HCS-12 HashLink
 *
 * A Gutenberg block that displays and controls a counter
 */

import { BlockBuilder } from '../../../src/hcs-12/builders/block-builder';

export const counterTemplate = `
<div class="wp-block-hashlink-counter {{className}}" data-block-id="{{blockId}}">
  <div class="counter-header">
    <h3 class="counter-title">{{title}}</h3>
    {{#if showDescription}}
      <p class="counter-description">{{description}}</p>
    {{/if}}
  </div>
  
  <div class="counter-display">
    <span class="counter-value" data-count="{{count}}">{{count}}</span>
  </div>
  
  <div class="counter-controls">
    <button class="counter-btn counter-btn-decrease" data-action="decrement">
      <span class="dashicons dashicons-minus"></span>
      {{step}}
    </button>
    
    <button class="counter-btn counter-btn-reset" data-action="reset">
      <span class="dashicons dashicons-update"></span>
      Reset
    </button>
    
    <button class="counter-btn counter-btn-increase" data-action="increment">
      <span class="dashicons dashicons-plus"></span>
      {{step}}
    </button>
  </div>
  
  {{#if showMultiply}}
  <div class="counter-multiply">
    <label>Multiply by:</label>
    <input type="number" class="multiply-input" value="2" min="1" max="10">
    <button class="counter-btn counter-btn-multiply" data-action="multiply">
      <span class="dashicons dashicons-yes"></span>
    </button>
  </div>
  {{/if}}
  
  {{#if showHistory}}
  <div class="counter-history">
    <h4>History</h4>
    <ul class="history-list">
      {{#each history}}
        <li>{{this.operation}}: {{this.oldValue}} → {{this.newValue}}</li>
      {{/each}}
    </ul>
  </div>
  {{/if}}
</div>
`;

export const counterStyles = `
.wp-block-hashlink-counter {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  text-align: center;
  max-width: 400px;
  margin: 0 auto;
}

.counter-header {
  margin-bottom: 20px;
}

.counter-title {
  margin: 0 0 10px;
  color: #23282d;
}

.counter-description {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.counter-display {
  margin: 30px 0;
}

.counter-value {
  font-size: 48px;
  font-weight: bold;
  color: #0073aa;
  display: inline-block;
  min-width: 100px;
  transition: all 0.3s ease;
}

.counter-value.updating {
  transform: scale(1.1);
  color: #00a0d2;
}

.counter-controls {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
}

.counter-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 20px;
  background: #0073aa;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;
}

.counter-btn:hover {
  background: #005a87;
}

.counter-btn:active {
  transform: scale(0.95);
}

.counter-btn-decrease {
  background: #d63638;
}

.counter-btn-decrease:hover {
  background: #b32d2e;
}

.counter-btn-reset {
  background: #666;
}

.counter-btn-reset:hover {
  background: #555;
}

.counter-multiply {
  margin: 20px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.multiply-input {
  width: 60px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.counter-history {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  text-align: left;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  max-height: 150px;
  overflow-y: auto;
}

.history-list li {
  padding: 5px 0;
  color: #666;
  font-size: 14px;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .wp-block-hashlink-counter {
    background: #1e1e1e;
    border-color: #333;
  }
  
  .counter-title {
    color: #fff;
  }
  
  .counter-description {
    color: #aaa;
  }
  
  .counter-value {
    color: #00a0d2;
  }
}

/* Responsive design */
@media (max-width: 480px) {
  .counter-controls {
    flex-wrap: wrap;
  }
  
  .counter-btn {
    flex: 1;
    min-width: 100px;
  }
}
`;

export function buildCounterBlock() {
  return new BlockBuilder()
    .setId('counter-block-v1')
    .setName('Counter')
    .setVersion('1.0.0')
    .setDescription('An interactive counter with customizable controls')
    .setCategory('widgets')
    .setIcon('dashicons-chart-line')

    .addKeyword('counter')
    .addKeyword('number')
    .addKeyword('increment')
    .addKeyword('math')

    .addAttribute('title', 'string', 'My Counter')
    .addAttribute(
      'description',
      'string',
      'Click the buttons to change the count',
    )
    .addAttribute('count', 'number', 0)
    .addAttribute('step', 'number', 1)
    .addAttribute('showDescription', 'boolean', true)
    .addAttribute('showMultiply', 'boolean', false)
    .addAttribute('showHistory', 'boolean', false)
    .addAttribute('history', 'array', [])

    .setTemplate(counterTemplate)
    .setStyles(counterStyles)

    .setSupports({
      align: ['center', 'wide', 'full'],
      className: true,
      customClassName: true,
      color: {
        background: true,
        text: false,
      },
      spacing: {
        margin: true,
        padding: true,
      },
    })

    .addAction('counter-action-v1')

    .setExample({
      attributes: {
        title: 'Example Counter',
        count: 42,
        step: 5,
        showMultiply: true,
      },
    })

    .build();
}

export const counterScripts = `
(function() {

  document.querySelectorAll('.wp-block-hashlink-counter').forEach(initCounterBlock);
  
  function initCounterBlock(block) {
    const blockId = block.dataset.blockId;
    const valueDisplay = block.querySelector('.counter-value');
    

    block.querySelectorAll('.counter-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        
        const action = this.dataset.action;
        const currentCount = parseInt(valueDisplay.dataset.count);
        let value = 1;
        

        if (action === 'increment' || action === 'decrement') {
          value = parseInt(block.querySelector('.counter-btn-increase').textContent.trim());
        } else if (action === 'multiply') {
          value = parseInt(block.querySelector('.multiply-input').value);
        }
        

        window.HashLink.executeAction(blockId, 'counter-action-v1', {
          operation: action,
          value: value,
          currentCount: currentCount
        });
        

        valueDisplay.classList.add('updating');
        setTimeout(() => valueDisplay.classList.remove('updating'), 300);
      });
    });
  }
})();
`;
