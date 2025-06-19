/**
 * Layout Engine for HCS-12 HashLinks
 *
 * Handles component positioning, responsive layouts, and layout validation
 * with support for flex, grid, absolute, and responsive positioning.
 */

import { Logger } from '../../utils/logger';

export interface LayoutDefinition {
  type:
    | 'absolute'
    | 'flex'
    | 'flex-item'
    | 'grid'
    | 'grid-item'
    | 'relative'
    | 'responsive';

  x?: number;
  y?: number;
  width?: number;
  height?: number;
  unit?: 'pixels' | 'percentage';

  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  gap?: number;

  flex?: number;
  alignSelf?:
    | 'auto'
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'stretch'
    | 'baseline';

  templateColumns?: string;
  templateRows?: string;

  gridColumn?: string;
  gridRow?: string;

  relativeTo?: string;
  offset?: { x: number; y: number };

  breakpoints?: Record<string, BreakpointDefinition>;
  visibility?: Record<string, boolean>;

  constraints?: LayoutConstraints;
}

export interface BreakpointDefinition {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  layout: LayoutDefinition;
}

export interface LayoutConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: string;
  maintainAspectRatio?: boolean;
}

export interface ComponentLayout {
  id: string;
  layout: LayoutDefinition;
  children?: string[];
}

export interface CalculatedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  isValid: boolean;
  components: Array<{
    id: string;
    calculatedLayout: CalculatedLayout;
    activeLayout?: LayoutDefinition;
    visible?: boolean;
  }>;
  errors?: string[];
  warnings?: string[];
  activeBreakpoint?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AnimationTransition {
  componentId: string;
  type: 'move' | 'resize' | 'appear' | 'disappear';
  properties: Record<string, { from: number; to: number }>;
  duration: number;
  easing: string;
}

export interface Container {
  width: number;
  height: number;
}

/**
 * Engine for calculating and managing component layouts
 */
export class LayoutEngine {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Calculate layout for all components
   */
  calculateLayout(
    components: ComponentLayout[],
    container: Container,
  ): LayoutResult {
    this.logger.debug('Calculating layout', {
      componentCount: components.length,
      containerSize: container,
    });

    try {
      const result: LayoutResult = {
        isValid: true,
        components: [],
      };

      const activeBreakpoint = this.determineBreakpoint(components, container);
      if (activeBreakpoint) {
        result.activeBreakpoint = activeBreakpoint;
      }

      const hierarchy = this.buildComponentHierarchy(components);

      for (const rootComponent of hierarchy.roots) {
        this.calculateComponentLayout(
          rootComponent,
          hierarchy.componentMap,
          container,
          { x: 0, y: 0, width: container.width, height: container.height },
          activeBreakpoint,
          result,
        );
      }

      const validation = this.validateLayout(components, container);
      if (!validation.isValid) {
        result.isValid = false;
        result.errors = validation.errors;
        result.warnings = validation.warnings;
      }

      this.logger.debug('Layout calculation completed', {
        isValid: result.isValid,
        componentCount: result.components.length,
        activeBreakpoint,
      });

      return result;
    } catch (error) {
      this.logger.error('Layout calculation failed', { error });
      return {
        isValid: false,
        components: [],
        errors: [
          error instanceof Error ? error.message : 'Unknown layout error',
        ],
      };
    }
  }

  /**
   * Validate layout for conflicts and constraints
   */
  validateLayout(
    components: ComponentLayout[],
    container: Container,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this.validateCircularDependencies(components, errors);

    this.validateOverlaps(components, container, errors);

    this.validateBounds(components, container, errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate transitions between layout states
   */
  generateLayoutTransitions(
    oldLayout: Array<{ id: string; calculatedLayout: CalculatedLayout }>,
    newLayout: Array<{ id: string; calculatedLayout: CalculatedLayout }>,
    options: { duration: number; easing: string },
  ): AnimationTransition[] {
    const transitions: AnimationTransition[] = [];

    const oldMap = new Map(oldLayout.map(c => [c.id, c.calculatedLayout]));
    const newMap = new Map(newLayout.map(c => [c.id, c.calculatedLayout]));

    for (const [id, newCalc] of newMap) {
      const oldCalc = oldMap.get(id);

      if (oldCalc) {
        const properties: Record<string, { from: number; to: number }> = {};

        if (oldCalc.x !== newCalc.x) {
          properties.x = { from: oldCalc.x, to: newCalc.x };
        }
        if (oldCalc.y !== newCalc.y) {
          properties.y = { from: oldCalc.y, to: newCalc.y };
        }
        if (oldCalc.width !== newCalc.width) {
          properties.width = { from: oldCalc.width, to: newCalc.width };
        }
        if (oldCalc.height !== newCalc.height) {
          properties.height = { from: oldCalc.height, to: newCalc.height };
        }

        if (Object.keys(properties).length > 0) {
          transitions.push({
            componentId: id,
            type: 'move',
            properties,
            duration: options.duration,
            easing: options.easing,
          });
        }
      } else {
        transitions.push({
          componentId: id,
          type: 'appear',
          properties: {
            opacity: { from: 0, to: 1 },
          },
          duration: options.duration,
          easing: options.easing,
        });
      }
    }

    for (const [id, oldCalc] of oldMap) {
      if (!newMap.has(id)) {
        transitions.push({
          componentId: id,
          type: 'disappear',
          properties: {
            opacity: { from: 1, to: 0 },
          },
          duration: options.duration,
          easing: options.easing,
        });
      }
    }

    return transitions;
  }

  /**
   * Determine active breakpoint for responsive layouts
   */
  private determineBreakpoint(
    components: ComponentLayout[],
    container: Container,
  ): string | undefined {
    const breakpoints: Array<{
      name: string;
      minWidth?: number;
      maxWidth?: number;
    }> = [];

    for (const component of components) {
      if (component.layout.type === 'responsive') {
        if (component.layout.breakpoints) {
          for (const [name, def] of Object.entries(
            component.layout.breakpoints,
          )) {
            if (!breakpoints.find(b => b.name === name)) {
              breakpoints.push({
                name,
                minWidth: def.minWidth,
                maxWidth: def.maxWidth,
              });
            }
          }
        } else if (component.layout.visibility) {
          for (const name of Object.keys(component.layout.visibility)) {
            if (!breakpoints.find(b => b.name === name)) {
              breakpoints.push(this.getDefaultBreakpoint(name));
            }
          }
        }
      }
    }

    for (const bp of breakpoints) {
      const matchesMin = !bp.minWidth || container.width >= bp.minWidth;
      const matchesMax = !bp.maxWidth || container.width <= bp.maxWidth;

      if (matchesMin && matchesMax) {
        return bp.name;
      }
    }

    return undefined;
  }

  /**
   * Get default breakpoint definition for common names
   */
  private getDefaultBreakpoint(name: string): {
    name: string;
    minWidth?: number;
    maxWidth?: number;
  } {
    switch (name) {
      case 'mobile':
        return { name, maxWidth: 768 };
      case 'tablet':
        return { name, minWidth: 769, maxWidth: 1024 };
      case 'desktop':
        return { name, minWidth: 1025 };
      default:
        return { name };
    }
  }

  /**
   * Build component hierarchy for layout calculation
   */
  private buildComponentHierarchy(components: ComponentLayout[]) {
    const componentMap = new Map<string, ComponentLayout>();
    const children = new Set<string>();

    for (const component of components) {
      componentMap.set(component.id, component);
      if (component.children) {
        for (const childId of component.children) {
          children.add(childId);
        }
      }
    }

    const roots = components.filter(c => !children.has(c.id));

    return { componentMap, roots };
  }

  /**
   * Calculate layout for a component and its children
   */
  private calculateComponentLayout(
    component: ComponentLayout,
    componentMap: Map<string, ComponentLayout>,
    container: Container,
    parentBounds: CalculatedLayout,
    activeBreakpoint: string | undefined,
    result: LayoutResult,
  ): void {
    let layout = component.layout;
    let visible = true;

    if (layout.type === 'responsive') {
      if (activeBreakpoint && layout.breakpoints?.[activeBreakpoint]) {
        layout = layout.breakpoints[activeBreakpoint].layout;
      }

      if (layout.visibility && activeBreakpoint) {
        visible = layout.visibility[activeBreakpoint] !== false;
      }
    }

    if (!visible) {
      result.components.push({
        id: component.id,
        calculatedLayout: { x: 0, y: 0, width: 0, height: 0 },
        activeLayout: layout,
        visible: false,
      });
      return;
    }

    const calculatedLayout = this.calculateSingleLayout(
      layout,
      parentBounds,
      container,
    );

    if (layout.constraints) {
      this.applyConstraints(calculatedLayout, layout.constraints);
    }

    result.components.push({
      id: component.id,
      calculatedLayout,
      activeLayout: layout,
      visible: true,
    });

    if (component.children && component.children.length > 0) {
      this.calculateChildrenLayouts(
        component,
        componentMap,
        container,
        calculatedLayout,
        layout,
        activeBreakpoint,
        result,
      );
    }
  }

  /**
   * Calculate layout for a single component
   */
  private calculateSingleLayout(
    layout: LayoutDefinition,
    parentBounds: CalculatedLayout,
    container: Container,
  ): CalculatedLayout {
    switch (layout.type) {
      case 'absolute':
        return this.calculateAbsoluteLayout(layout, parentBounds, container);
      case 'flex-item':
        return this.calculateFlexItemLayout(layout, parentBounds);
      case 'grid-item':
        return this.calculateGridItemLayout(layout, parentBounds);
      case 'relative':
        return this.calculateRelativeLayout(layout, parentBounds);
      default:
        return { ...parentBounds };
    }
  }

  /**
   * Calculate absolute positioning
   */
  private calculateAbsoluteLayout(
    layout: LayoutDefinition,
    parentBounds: CalculatedLayout,
    container: Container,
  ): CalculatedLayout {
    const unit = layout.unit || 'pixels';

    let x = layout.x || 0;
    let y = layout.y || 0;
    let width = layout.width || parentBounds.width;
    let height = layout.height || parentBounds.height;

    if (unit === 'percentage') {
      x = (x / 100) * parentBounds.width;
      y = (y / 100) * parentBounds.height;
      width = (width / 100) * parentBounds.width;
      height = (height / 100) * parentBounds.height;
    }

    return {
      x: parentBounds.x + x,
      y: parentBounds.y + y,
      width,
      height,
    };
  }

  /**
   * Calculate flex item positioning (placeholder - requires parent flex context)
   */
  private calculateFlexItemLayout(
    layout: LayoutDefinition,
    parentBounds: CalculatedLayout,
  ): CalculatedLayout {
    return {
      x: parentBounds.x,
      y: parentBounds.y,
      width: layout.width || parentBounds.width,
      height: layout.height || parentBounds.height,
    };
  }

  /**
   * Calculate grid item positioning (placeholder - requires parent grid context)
   */
  private calculateGridItemLayout(
    layout: LayoutDefinition,
    parentBounds: CalculatedLayout,
  ): CalculatedLayout {
    return {
      x: parentBounds.x,
      y: parentBounds.y,
      width: parentBounds.width,
      height: parentBounds.height,
    };
  }

  /**
   * Calculate relative positioning
   */
  private calculateRelativeLayout(
    layout: LayoutDefinition,
    parentBounds: CalculatedLayout,
  ): CalculatedLayout {
    const offset = layout.offset || { x: 0, y: 0 };

    return {
      x: parentBounds.x + offset.x,
      y: parentBounds.y + offset.y,
      width: parentBounds.width,
      height: parentBounds.height,
    };
  }

  /**
   * Calculate layouts for child components
   */
  private calculateChildrenLayouts(
    parent: ComponentLayout,
    componentMap: Map<string, ComponentLayout>,
    container: Container,
    parentBounds: CalculatedLayout,
    parentLayout: LayoutDefinition,
    activeBreakpoint: string | undefined,
    result: LayoutResult,
  ): void {
    if (!parent.children) return;

    const children = parent.children
      .map(id => componentMap.get(id))
      .filter(c => c !== undefined) as ComponentLayout[];

    if (parentLayout.type === 'flex') {
      this.calculateFlexChildren(
        children,
        componentMap,
        container,
        parentBounds,
        parentLayout,
        activeBreakpoint,
        result,
      );
    } else if (parentLayout.type === 'grid') {
      this.calculateGridChildren(
        children,
        componentMap,
        container,
        parentBounds,
        parentLayout,
        activeBreakpoint,
        result,
      );
    } else {
      for (const child of children) {
        this.calculateComponentLayout(
          child,
          componentMap,
          container,
          parentBounds,
          activeBreakpoint,
          result,
        );
      }
    }
  }

  /**
   * Calculate flex container children
   */
  private calculateFlexChildren(
    children: ComponentLayout[],
    componentMap: Map<string, ComponentLayout>,
    container: Container,
    parentBounds: CalculatedLayout,
    flexLayout: LayoutDefinition,
    activeBreakpoint: string | undefined,
    result: LayoutResult,
  ): void {
    const direction = flexLayout.direction || 'row';
    const gap = flexLayout.gap || 0;
    const isRow = direction === 'row' || direction === 'row-reverse';

    let totalFlex = 0;
    let totalFixed = 0;
    const childFlexes: number[] = [];

    for (const child of children) {
      const flex = child.layout.flex || 0;
      childFlexes.push(flex);
      totalFlex += flex;

      if (!flex) {
        const size = isRow ? child.layout.width || 0 : child.layout.height || 0;
        totalFixed += size;
      }
    }

    const totalGaps = Math.max(0, children.length - 1) * gap;
    const availableSpace =
      (isRow ? parentBounds.width : parentBounds.height) -
      totalFixed -
      totalGaps;
    const flexUnit = totalFlex > 0 ? availableSpace / totalFlex : 0;

    let currentPos = isRow ? parentBounds.x : parentBounds.y;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const flex = childFlexes[i];

      let childWidth: number;
      let childHeight: number;

      if (isRow) {
        childWidth = flex > 0 ? flex * flexUnit : child.layout.width || 0;
        childHeight = child.layout.height || parentBounds.height;
      } else {
        childWidth = child.layout.width || parentBounds.width;
        childHeight = flex > 0 ? flex * flexUnit : child.layout.height || 0;
      }

      const childBounds: CalculatedLayout = {
        x: isRow ? currentPos : parentBounds.x,
        y: isRow ? parentBounds.y : currentPos,
        width: childWidth,
        height: childHeight,
      };

      result.components.push({
        id: child.id,
        calculatedLayout: childBounds,
        activeLayout: child.layout,
        visible: true,
      });

      currentPos += (isRow ? childWidth : childHeight) + gap;

      if (child.children) {
        this.calculateChildrenLayouts(
          child,
          componentMap,
          container,
          childBounds,
          child.layout,
          activeBreakpoint,
          result,
        );
      }
    }
  }

  /**
   * Calculate grid container children
   */
  private calculateGridChildren(
    children: ComponentLayout[],
    componentMap: Map<string, ComponentLayout>,
    container: Container,
    parentBounds: CalculatedLayout,
    gridLayout: LayoutDefinition,
    activeBreakpoint: string | undefined,
    result: LayoutResult,
  ): void {
    const templateColumns = gridLayout.templateColumns || '1fr';
    const templateRows = gridLayout.templateRows || '1fr';
    const gap = gridLayout.gap || 0;

    const columns = this.parseGridTemplate(templateColumns);
    const rows = this.parseGridTemplate(templateRows);

    const availableWidth = parentBounds.width - (columns.length - 1) * gap;
    const availableHeight = parentBounds.height - (rows.length - 1) * gap;

    const columnWidths = this.calculateGridTrackSizes(columns, availableWidth);
    const rowHeights = this.calculateGridTrackSizes(rows, availableHeight);

    for (const child of children) {
      const gridColumn = child.layout.gridColumn || '1 / 2';
      const gridRow = child.layout.gridRow || '1 / 2';

      const [colStart, colEnd] = this.parseGridPosition(
        gridColumn,
        columns.length,
      );
      const [rowStart, rowEnd] = this.parseGridPosition(gridRow, rows.length);

      const x =
        parentBounds.x +
        columnWidths
          .slice(0, colStart - 1)
          .reduce((sum, w) => sum + w + gap, 0);
      const y =
        parentBounds.y +
        rowHeights.slice(0, rowStart - 1).reduce((sum, h) => sum + h + gap, 0);

      const width =
        columnWidths
          .slice(colStart - 1, colEnd - 1)
          .reduce((sum, w) => sum + w, 0) +
        (colEnd - colStart - 1) * gap;
      const height =
        rowHeights
          .slice(rowStart - 1, rowEnd - 1)
          .reduce((sum, h) => sum + h, 0) +
        (rowEnd - rowStart - 1) * gap;

      const childBounds: CalculatedLayout = { x, y, width, height };

      result.components.push({
        id: child.id,
        calculatedLayout: childBounds,
        activeLayout: child.layout,
        visible: true,
      });

      if (child.children) {
        this.calculateChildrenLayouts(
          child,
          componentMap,
          container,
          childBounds,
          child.layout,
          activeBreakpoint,
          result,
        );
      }
    }
  }

  /**
   * Apply layout constraints
   */
  private applyConstraints(
    layout: CalculatedLayout,
    constraints: LayoutConstraints,
  ): void {
    if (constraints.minWidth !== undefined) {
      layout.width = Math.max(layout.width, constraints.minWidth);
    }
    if (constraints.maxWidth !== undefined) {
      layout.width = Math.min(layout.width, constraints.maxWidth);
    }
    if (constraints.minHeight !== undefined) {
      layout.height = Math.max(layout.height, constraints.minHeight);
    }
    if (constraints.maxHeight !== undefined) {
      layout.height = Math.min(layout.height, constraints.maxHeight);
    }

    if (constraints.aspectRatio && constraints.maintainAspectRatio) {
      const [widthRatio, heightRatio] = constraints.aspectRatio
        .split(':')
        .map(Number);
      const targetRatio = widthRatio / heightRatio;
      const currentRatio = layout.width / layout.height;

      if (Math.abs(currentRatio - targetRatio) > 0.01) {
        layout.height = layout.width / targetRatio;
      }
    }
  }

  /**
   * Parse grid template string (simplified)
   */
  private parseGridTemplate(template: string): string[] {
    if (template.startsWith('repeat(')) {
      const match = template.match(/repeat\((\d+),\s*(.+)\)/);
      if (match) {
        const count = parseInt(match[1]);
        const unit = match[2];
        return Array(count).fill(unit);
      }
    }

    return template.split(' ');
  }

  /**
   * Calculate grid track sizes
   */
  private calculateGridTrackSizes(
    tracks: string[],
    availableSpace: number,
  ): number[] {
    const sizes: number[] = [];
    let remainingSpace = availableSpace;
    let frCount = 0;

    for (const track of tracks) {
      if (track.endsWith('fr')) {
        frCount += parseFloat(track);
        sizes.push(0);
      } else if (track.endsWith('px')) {
        const size = parseFloat(track);
        sizes.push(size);
        remainingSpace -= size;
      } else {
        sizes.push(0);
        frCount += 1;
      }
    }

    const frUnit = frCount > 0 ? remainingSpace / frCount : 0;

    for (let i = 0; i < tracks.length; i++) {
      if (sizes[i] === 0) {
        const track = tracks[i];
        if (track.endsWith('fr')) {
          sizes[i] = parseFloat(track) * frUnit;
        } else {
          sizes[i] = frUnit;
        }
      }
    }

    return sizes;
  }

  /**
   * Parse grid position string
   */
  private parseGridPosition(
    position: string,
    maxTracks: number,
  ): [number, number] {
    const parts = position.split(' / ');
    const start = parseInt(parts[0]) || 1;
    const end = parts.length > 1 ? parseInt(parts[1]) || start + 1 : start + 1;

    return [
      Math.max(1, Math.min(start, maxTracks + 1)),
      Math.max(start + 1, Math.min(end, maxTracks + 1)),
    ];
  }

  /**
   * Validate circular dependencies
   */
  private validateCircularDependencies(
    components: ComponentLayout[],
    errors: string[],
  ): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (componentId: string, path: string[]): void => {
      if (visiting.has(componentId)) {
        errors.push(
          `Circular layout dependency detected involving ${path.join(' and ')}`,
        );
        return;
      }

      if (visited.has(componentId)) return;

      visiting.add(componentId);

      const component = components.find(c => c.id === componentId);
      if (component?.layout.relativeTo) {
        visit(component.layout.relativeTo, [...path, componentId]);
      }

      visiting.delete(componentId);
      visited.add(componentId);
    };

    for (const component of components) {
      visit(component.id, []);
    }
  }

  /**
   * Validate component overlaps
   */
  private validateOverlaps(
    components: ComponentLayout[],
    container: Container,
    errors: string[],
  ): void {
    const absoluteComponents = components.filter(
      c => c.layout.type === 'absolute',
    );

    for (let i = 0; i < absoluteComponents.length; i++) {
      for (let j = i + 1; j < absoluteComponents.length; j++) {
        const comp1 = absoluteComponents[i];
        const comp2 = absoluteComponents[j];

        const layout1 = this.calculateAbsoluteLayout(
          comp1.layout,
          { x: 0, y: 0, width: container.width, height: container.height },
          container,
        );
        const layout2 = this.calculateAbsoluteLayout(
          comp2.layout,
          { x: 0, y: 0, width: container.width, height: container.height },
          container,
        );

        if (this.layoutsOverlap(layout1, layout2)) {
          errors.push(`Components "${comp1.id}" and "${comp2.id}" overlap`);
        }
      }
    }
  }

  /**
   * Validate component bounds
   */
  private validateBounds(
    components: ComponentLayout[],
    container: Container,
    errors: string[],
  ): void {
    for (const component of components) {
      if (component.layout.type === 'absolute') {
        const layout = this.calculateAbsoluteLayout(
          component.layout,
          { x: 0, y: 0, width: container.width, height: container.height },
          container,
        );

        if (
          layout.x + layout.width > container.width ||
          layout.y + layout.height > container.height
        ) {
          errors.push(
            `Component "${component.id}" extends beyond container bounds`,
          );
        }
      }
    }
  }

  /**
   * Check if two layouts overlap
   */
  private layoutsOverlap(
    layout1: CalculatedLayout,
    layout2: CalculatedLayout,
  ): boolean {
    return !(
      layout1.x + layout1.width <= layout2.x ||
      layout2.x + layout2.width <= layout1.x ||
      layout1.y + layout1.height <= layout2.y ||
      layout2.y + layout2.height <= layout1.y
    );
  }
}
