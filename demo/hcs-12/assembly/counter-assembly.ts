/**
 * Counter Assembly for HCS-12 HashLink
 *
 * Composes the counter action and block into a complete application
 */

import { AssemblyBuilder } from '../../../src/hcs-12/builders/assembly-builder';

export function buildCounterAssembly() {
  return new AssemblyBuilder()
    .setId('counter-assembly-v1')
    .setName('Counter Application')
    .setVersion('1.0.0')
    .setDescription('A complete counter application with multiple operations')

    .addAction('counter-action-v1')
    .addBlock('counter-block-v1')

    .addBinding({
      actionId: 'counter-action-v1',
      blockId: 'counter-block-v1',
      trigger: 'onClick:.counter-btn-increase',
      parameters: {
        operation: 'increment',
        value: '{{attributes.step}}',
        currentCount: '{{attributes.count}}',
      },
      outputs: {
        result: 'attributes.count',
      },
    })

    .addBinding({
      actionId: 'counter-action-v1',
      blockId: 'counter-block-v1',
      trigger: 'onClick:.counter-btn-decrease',
      parameters: {
        operation: 'decrement',
        value: '{{attributes.step}}',
        currentCount: '{{attributes.count}}',
      },
      outputs: {
        result: 'attributes.count',
      },
    })

    .addBinding({
      actionId: 'counter-action-v1',
      blockId: 'counter-block-v1',
      trigger: 'onClick:.counter-btn-reset',
      parameters: {
        operation: 'reset',
        value: '0',
        currentCount: '{{attributes.count}}',
      },
      outputs: {
        result: 'attributes.count',
      },
    })

    .addBinding({
      actionId: 'counter-action-v1',
      blockId: 'counter-block-v1',
      trigger: 'onClick:.counter-btn-multiply',
      parameters: {
        operation: 'multiply',
        value: '{{querySelector:.multiply-input.value}}',
        currentCount: '{{attributes.count}}',
      },
      outputs: {
        result: 'attributes.count',
      },
      conditions: [
        {
          type: 'attribute',
          field: 'showMultiply',
          operator: '===',
          value: true,
        },
      ],
    })

    .addBinding({
      actionId: 'counter-action-v1',
      blockId: 'counter-block-v1',
      trigger: 'onStateChange:count',
      parameters: {
        operation: '{{event.operation}}',
        value: '{{event.value}}',
        currentCount: '{{event.oldValue}}',
      },
      outputs: {
        result: 'history[]',
      },
      conditions: [
        {
          type: 'attribute',
          field: 'showHistory',
          operator: '===',
          value: true,
        },
      ],
    })

    .setPermissions({
      execute: ['PUBLIC'],
      update: ['CREATOR'],
      delete: ['CREATOR'],
    })

    .setMetadata({
      author: 'HashLink Examples',
      license: 'MIT',
      repository: 'https://github.com/hashgraph/standards-sdk',
      documentation: 'https://docs.hashlink.io/examples/counter',
      features: [
        'increment',
        'decrement',
        'reset',
        'multiply',
        'history tracking',
      ],
      requirements: {
        minSdkVersion: '0.0.130',
      },
    })

    .build();
}

export const counterAssemblyPresets = {
  basic: {
    blocks: [
      {
        id: 'counter-block-v1',
        attributes: {
          title: 'Basic Counter',
          showMultiply: false,
          showHistory: false,
          step: 1,
        },
      },
    ],
  },

  advanced: {
    blocks: [
      {
        id: 'counter-block-v1',
        attributes: {
          title: 'Advanced Counter',
          description: 'Full-featured counter with history',
          showMultiply: true,
          showHistory: true,
          step: 5,
        },
      },
    ],
  },

  scoreboard: {
    blocks: [
      {
        id: 'counter-block-v1',
        attributes: {
          title: 'Team A',
          showMultiply: false,
          showHistory: false,
          step: 1,
          count: 0,
        },
      },
      {
        id: 'counter-block-v1',
        attributes: {
          title: 'Team B',
          showMultiply: false,
          showHistory: false,
          step: 1,
          count: 0,
        },
      },
    ],
  },
};
