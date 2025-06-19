/**
 * Counter Action for HCS-12 HashLink
 *
 * A simple WASM action that performs counter operations
 */

import { ActionBuilder } from '../../../src/hcs-12/builders/action-builder';

export const counterWasmSource = `

export function execute(operation: string, value: i32, currentCount: i32): i32 {
  if (operation == "increment") {
    return currentCount + value;
  } else if (operation == "decrement") {
    return currentCount - value;
  } else if (operation == "reset") {
    return 0;
  } else if (operation == "multiply") {
    return currentCount * value;
  }
  return currentCount;
}


export function validate(operation: string, value: i32): bool {

  if (operation != "increment" && 
      operation != "decrement" && 
      operation != "reset" && 
      operation != "multiply") {
    return false;
  }
  

  if (value < -1000 || value > 1000) {
    return false;
  }
  
  return true;
}


export function getDescription(operation: string): string {
  if (operation == "increment") {
    return "Increases the counter";
  } else if (operation == "decrement") {
    return "Decreases the counter";
  } else if (operation == "reset") {
    return "Resets counter to zero";
  } else if (operation == "multiply") {
    return "Multiplies the counter";
  }
  return "Unknown operation";
}
`;

export function buildCounterAction() {
  return new ActionBuilder()
    .setId('counter-action-v1')
    .setName('Counter Action')
    .setVersion('1.0.0')
    .setDescription('Performs arithmetic operations on a counter')
    .setCategory('math')

    .addParameter('operation', 'string', true)
    .addParameter('value', 'number', true)
    .addParameter('currentCount', 'number', true)

    .addCapability('READ_STATE')
    .addCapability('WRITE_STATE')
    .addCapability('EMIT_EVENT')

    .setMetadata({
      author: 'HashLink Examples',
      license: 'MIT',
      repository: 'https://github.com/hashgraph/standards-sdk',
      operations: ['increment', 'decrement', 'reset', 'multiply'],
      limits: {
        minValue: -1000,
        maxValue: 1000,
      },
    })

    .addTag('counter')
    .addTag('math')
    .addTag('example')

    .build();
}

export const counterWasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);
