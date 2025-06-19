/**
 * Tests for Layout Engine
 *
 * Tests component positioning, responsive layouts, and layout validation for HashLinks
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LayoutEngine } from '../../../src/hcs-12/assembly/layout-engine';
import { Logger } from '../../../src/utils/logger';

describe('LayoutEngine', () => {
  let layoutEngine: LayoutEngine;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'LayoutEngineTest' });
    layoutEngine = new LayoutEngine(logger);
  });

  describe('Layout Calculation', () => {
    it('should calculate absolute positions for components', () => {
      const components = [
        {
          id: 'header',
          layout: {
            type: 'absolute',
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            unit: 'percentage',
          },
        },
        {
          id: 'sidebar',
          layout: {
            type: 'absolute',
            x: 0,
            y: 20,
            width: 25,
            height: 80,
            unit: 'percentage',
          },
        },
        {
          id: 'content',
          layout: {
            type: 'absolute',
            x: 25,
            y: 20,
            width: 75,
            height: 80,
            unit: 'percentage',
          },
        },
      ];

      const container = {
        width: 1200,
        height: 800,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);
      expect(result.components).toHaveLength(3);

      const header = result.components.find(c => c.id === 'header');
      expect(header?.calculatedLayout).toEqual({
        x: 0,
        y: 0,
        width: 1200,
        height: 160,
      });

      const sidebar = result.components.find(c => c.id === 'sidebar');
      expect(sidebar?.calculatedLayout).toEqual({
        x: 0,
        y: 160,
        width: 300,
        height: 640,
      });
    });

    it('should calculate flex layout positions', () => {
      const components = [
        {
          id: 'container',
          layout: {
            type: 'flex',
            direction: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          },
          children: ['item1', 'item2', 'item3'],
        },
        {
          id: 'item1',
          layout: {
            type: 'flex-item',
            flex: 1,
          },
        },
        {
          id: 'item2',
          layout: {
            type: 'flex-item',
            flex: 2,
          },
        },
        {
          id: 'item3',
          layout: {
            type: 'flex-item',
            flex: 1,
          },
        },
      ];

      const container = {
        width: 800,
        height: 600,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);

      const item1 = result.components.find(c => c.id === 'item1');
      const item2 = result.components.find(c => c.id === 'item2');
      const item3 = result.components.find(c => c.id === 'item3');

      expect(item1?.calculatedLayout.width).toBe(192);
      expect(item2?.calculatedLayout.width).toBe(384);
      expect(item3?.calculatedLayout.width).toBe(192);
    });

    it('should calculate grid layout positions', () => {
      const components = [
        {
          id: 'grid-container',
          layout: {
            type: 'grid',
            templateColumns: 'repeat(3, 1fr)',
            templateRows: 'repeat(2, 1fr)',
            gap: 10,
          },
          children: ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'],
        },
        {
          id: 'item1',
          layout: {
            type: 'grid-item',
            gridColumn: '1 / 2',
            gridRow: '1 / 2',
          },
        },
        {
          id: 'item2',
          layout: {
            type: 'grid-item',
            gridColumn: '2 / 3',
            gridRow: '1 / 2',
          },
        },
        {
          id: 'item3',
          layout: {
            type: 'grid-item',
            gridColumn: '3 / 4',
            gridRow: '1 / 2',
          },
        },
        {
          id: 'item4',
          layout: {
            type: 'grid-item',
            gridColumn: '1 / 3',
            gridRow: '2 / 3',
          },
        },
        {
          id: 'item5',
          layout: {
            type: 'grid-item',
            gridColumn: '3 / 4',
            gridRow: '2 / 3',
          },
        },
      ];

      const container = {
        width: 900,
        height: 600,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);

      const item1 = result.components.find(c => c.id === 'item1');
      const item4 = result.components.find(c => c.id === 'item4');

      expect(item1?.calculatedLayout.width).toBeCloseTo(293.33, 1);

      expect(item4?.calculatedLayout.width).toBeCloseTo(596.67, 1);
    });
  });

  describe('Responsive Layout', () => {
    it('should apply responsive breakpoints', () => {
      const components = [
        {
          id: 'responsive-container',
          layout: {
            type: 'responsive',
            breakpoints: {
              mobile: {
                maxWidth: 768,
                layout: {
                  type: 'flex',
                  direction: 'column',
                },
              },
              tablet: {
                minWidth: 769,
                maxWidth: 1024,
                layout: {
                  type: 'flex',
                  direction: 'row',
                },
              },
              desktop: {
                minWidth: 1025,
                layout: {
                  type: 'grid',
                  templateColumns: 'repeat(3, 1fr)',
                },
              },
            },
          },
        },
      ];

      let result = layoutEngine.calculateLayout(components, {
        width: 600,
        height: 800,
      });
      expect(result.isValid).toBe(true);
      expect(result.activeBreakpoint).toBe('mobile');

      const mobileContainer = result.components.find(
        c => c.id === 'responsive-container',
      );
      expect(mobileContainer?.activeLayout.direction).toBe('column');

      result = layoutEngine.calculateLayout(components, {
        width: 900,
        height: 600,
      });
      expect(result.activeBreakpoint).toBe('tablet');

      const tabletContainer = result.components.find(
        c => c.id === 'responsive-container',
      );
      expect(tabletContainer?.activeLayout.direction).toBe('row');

      result = layoutEngine.calculateLayout(components, {
        width: 1200,
        height: 800,
      });
      expect(result.activeBreakpoint).toBe('desktop');

      const desktopContainer = result.components.find(
        c => c.id === 'responsive-container',
      );
      expect(desktopContainer?.activeLayout.templateColumns).toBe(
        'repeat(3, 1fr)',
      );
    });

    it('should handle responsive component visibility', () => {
      const components = [
        {
          id: 'mobile-only',
          layout: {
            type: 'responsive',
            visibility: {
              mobile: true,
              tablet: false,
              desktop: false,
            },
          },
        },
        {
          id: 'desktop-only',
          layout: {
            type: 'responsive',
            visibility: {
              mobile: false,
              tablet: false,
              desktop: true,
            },
          },
        },
      ];

      let result = layoutEngine.calculateLayout(components, {
        width: 600,
        height: 800,
      });
      const mobileOnlyVisible = result.components.find(
        c => c.id === 'mobile-only',
      );
      const desktopOnlyMobile = result.components.find(
        c => c.id === 'desktop-only',
      );

      expect(mobileOnlyVisible?.visible).toBe(true);
      expect(desktopOnlyMobile?.visible).toBe(false);

      result = layoutEngine.calculateLayout(components, {
        width: 1200,
        height: 800,
      });
      const mobileOnlyDesktop = result.components.find(
        c => c.id === 'mobile-only',
      );
      const desktopOnlyVisible = result.components.find(
        c => c.id === 'desktop-only',
      );

      expect(mobileOnlyDesktop?.visible).toBe(false);
      expect(desktopOnlyVisible?.visible).toBe(true);
    });
  });

  describe('Layout Validation', () => {
    it('should detect overlapping components', () => {
      const components = [
        {
          id: 'component1',
          layout: {
            type: 'absolute',
            x: 0,
            y: 0,
            width: 200,
            height: 200,
            unit: 'pixels',
          },
        },
        {
          id: 'component2',
          layout: {
            type: 'absolute',
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            unit: 'pixels',
          },
        },
      ];

      const container = {
        width: 800,
        height: 600,
      };

      const result = layoutEngine.validateLayout(components, container);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Components "component1" and "component2" overlap',
      );
    });

    it('should detect components outside container bounds', () => {
      const components = [
        {
          id: 'outside-component',
          layout: {
            type: 'absolute',
            x: 700,
            y: 500,
            width: 200,
            height: 200,
            unit: 'pixels',
          },
        },
      ];

      const container = {
        width: 800,
        height: 600,
      };

      const result = layoutEngine.validateLayout(components, container);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Component "outside-component" extends beyond container bounds',
      );
    });

    it('should validate circular layout dependencies', () => {
      const components = [
        {
          id: 'component1',
          layout: {
            type: 'relative',
            relativeTo: 'component2',
            offset: { x: 10, y: 10 },
          },
        },
        {
          id: 'component2',
          layout: {
            type: 'relative',
            relativeTo: 'component1',
            offset: { x: 20, y: 20 },
          },
        },
      ];

      const container = {
        width: 800,
        height: 600,
      };

      const result = layoutEngine.validateLayout(components, container);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Circular layout dependency detected involving component1 and component2',
      );
    });
  });

  describe('Layout Animation', () => {
    it('should generate transition animations between layouts', () => {
      const oldLayout = [
        {
          id: 'animated-component',
          calculatedLayout: {
            x: 0,
            y: 0,
            width: 200,
            height: 200,
          },
        },
      ];

      const newLayout = [
        {
          id: 'animated-component',
          calculatedLayout: {
            x: 100,
            y: 50,
            width: 300,
            height: 250,
          },
        },
      ];

      const animations = layoutEngine.generateLayoutTransitions(
        oldLayout,
        newLayout,
        {
          duration: 300,
          easing: 'ease-in-out',
        },
      );

      expect(animations).toHaveLength(1);
      expect(animations[0].componentId).toBe('animated-component');
      expect(animations[0].properties).toEqual({
        x: { from: 0, to: 100 },
        y: { from: 0, to: 50 },
        width: { from: 200, to: 300 },
        height: { from: 200, to: 250 },
      });
      expect(animations[0].duration).toBe(300);
      expect(animations[0].easing).toBe('ease-in-out');
    });

    it('should handle component appearance and disappearance', () => {
      const oldLayout = [
        {
          id: 'existing-component',
          calculatedLayout: { x: 0, y: 0, width: 200, height: 200 },
        },
      ];

      const newLayout = [
        {
          id: 'existing-component',
          calculatedLayout: { x: 0, y: 0, width: 200, height: 200 },
        },
        {
          id: 'new-component',
          calculatedLayout: { x: 250, y: 0, width: 200, height: 200 },
        },
      ];

      const animations = layoutEngine.generateLayoutTransitions(
        oldLayout,
        newLayout,
        {
          duration: 300,
          easing: 'ease-in',
        },
      );

      const newComponentAnimation = animations.find(
        a => a.componentId === 'new-component',
      );
      expect(newComponentAnimation).toBeDefined();
      expect(newComponentAnimation?.type).toBe('appear');
      expect(newComponentAnimation?.properties.opacity).toEqual({
        from: 0,
        to: 1,
      });
    });
  });

  describe('Layout Constraints', () => {
    it('should enforce aspect ratio constraints', () => {
      const components = [
        {
          id: 'constrained-component',
          layout: {
            type: 'absolute',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            constraints: {
              aspectRatio: '16:9',
              maintainAspectRatio: true,
            },
            unit: 'pixels',
          },
        },
      ];

      const container = {
        width: 800,
        height: 600,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);

      const component = result.components.find(
        c => c.id === 'constrained-component',
      );
      const aspectRatio =
        component!.calculatedLayout.width / component!.calculatedLayout.height;
      expect(aspectRatio).toBeCloseTo(16 / 9, 2);
    });

    it('should enforce minimum and maximum size constraints', () => {
      const components = [
        {
          id: 'size-constrained',
          layout: {
            type: 'flex-item',
            flex: 1,
            constraints: {
              minWidth: 200,
              maxWidth: 500,
              minHeight: 100,
              maxHeight: 300,
            },
          },
        },
      ];

      const container = {
        width: 1000,
        height: 400,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);

      const component = result.components.find(
        c => c.id === 'size-constrained',
      );
      expect(component!.calculatedLayout.width).toBeGreaterThanOrEqual(200);
      expect(component!.calculatedLayout.width).toBeLessThanOrEqual(500);
      expect(component!.calculatedLayout.height).toBeGreaterThanOrEqual(100);
      expect(component!.calculatedLayout.height).toBeLessThanOrEqual(300);
    });
  });

  describe('Layout Nesting', () => {
    it('should handle nested layout containers', () => {
      const components = [
        {
          id: 'outer-container',
          layout: {
            type: 'flex',
            direction: 'column',
            gap: 20,
          },
          children: ['header', 'main-content'],
        },
        {
          id: 'header',
          layout: {
            type: 'flex-item',
            height: 80,
          },
        },
        {
          id: 'main-content',
          layout: {
            type: 'flex',
            direction: 'row',
            gap: 16,
          },
          children: ['sidebar', 'content-area'],
        },
        {
          id: 'sidebar',
          layout: {
            type: 'flex-item',
            width: 250,
          },
        },
        {
          id: 'content-area',
          layout: {
            type: 'flex-item',
            flex: 1,
          },
        },
      ];

      const container = {
        width: 1200,
        height: 800,
      };

      const result = layoutEngine.calculateLayout(components, container);

      expect(result.isValid).toBe(true);

      const header = result.components.find(c => c.id === 'header');
      const sidebar = result.components.find(c => c.id === 'sidebar');
      const contentArea = result.components.find(c => c.id === 'content-area');

      expect(header?.calculatedLayout.height).toBe(80);
      expect(sidebar?.calculatedLayout.width).toBe(250);

      expect(contentArea?.calculatedLayout.width).toBe(934);
    });
  });
});
