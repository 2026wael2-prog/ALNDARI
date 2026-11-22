import { create } from 'zustand';
import type { InspectorTarget } from './types';

interface EntityInspectorState {
  stack: InspectorTarget[];
  open: (target: InspectorTarget) => void;
  drillDown: (target: InspectorTarget) => void;
  back: () => void;
  goToIndex: (index: number) => void;
  close: () => void;
}

export const useEntityInspectorStore = create<EntityInspectorState>(set => ({
  stack: [],
  open: target => {
    if (!target.id) return;
    set({ stack: [target] });
  },
  drillDown: target => {
    if (!target.id) return;
    set(state => {
      const top = state.stack[state.stack.length - 1];
      if (top && top.type === target.type && top.id === target.id) {
        return state;
      }
      return { stack: [...state.stack, target] };
    });
  },
  back: () =>
    set(state => ({
      stack: state.stack.length > 1 ? state.stack.slice(0, -1) : state.stack,
    })),
  goToIndex: index =>
    set(state => ({
      stack: state.stack.slice(0, Math.max(1, index + 1)),
    })),
  close: () => set({ stack: [] }),
}));
