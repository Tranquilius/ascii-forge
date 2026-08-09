import { beforeEach, describe, expect, it } from 'vitest';
import { FULL_TAB_ID, useAppStore } from './store';
import { DEFAULT_PARAMS } from './engine/defaults';

const s = () => useAppStore.getState();

/** Reset to a single full-image tab between tests. */
beforeEach(() => {
  useAppStore.setState({
    params: { ...DEFAULT_PARAMS },
    tabs: [{ id: FULL_TAB_ID, label: 'Full', params: { ...DEFAULT_PARAMS } }],
    activeTabId: FULL_TAB_ID,
    cropping: false,
  });
});

const HALF = { x: 0, y: 0, w: 0.5, h: 0.5 };

describe('tabs own their settings', () => {
  it('a crop snapshots the settings in force at that moment', () => {
    s().setParam('cols', 300);
    s().setParam('brightness', 42);
    s().commitCrop(HALF);

    expect(s().tabs).toHaveLength(2);
    expect(s().params.cols).toBe(300);
    expect(s().params.brightness).toBe(42);
    expect(s().params.crop).toEqual(HALF);
  });

  // The whole point: two views of one image must be independently tunable.
  it('changing one tab does not affect another', () => {
    s().commitCrop(HALF);
    const cropTabId = s().activeTabId;

    s().setParam('cols', 400);
    expect(s().params.cols).toBe(400);

    s().selectTab(FULL_TAB_ID);
    expect(s().params.cols).toBe(DEFAULT_PARAMS.cols);

    s().setParam('cols', 90);
    s().selectTab(cropTabId);
    expect(s().params.cols).toBe(400);

    s().selectTab(FULL_TAB_ID);
    expect(s().params.cols).toBe(90);
  });

  it('switching tabs restores every setting, not just the crop', () => {
    s().setParams({ ramp: 'blocks', gamma: 2, monoColor: '#ff0000' });
    s().commitCrop(HALF);
    s().setParams({ ramp: 'minimal', gamma: 0.5, monoColor: '#00ff00' });

    s().selectTab(FULL_TAB_ID);
    expect(s().params).toMatchObject({ ramp: 'blocks', gamma: 2, monoColor: '#ff0000' });
    expect(s().params.crop).toBeNull();
  });

  it('the mirror and the active tab never diverge', () => {
    s().commitCrop(HALF);
    s().setParam('contrast', 77);
    const active = s().tabs.find((t) => t.id === s().activeTabId);
    expect(active?.params).toEqual(s().params);
    expect(active?.params.contrast).toBe(77);
  });

  it('a second crop inherits the crop tab it was taken from, not the full view', () => {
    s().setParam('pixelate', 3);
    s().commitCrop(HALF);
    s().setParam('pixelate', 9);
    s().commitCrop(HALF);

    expect(s().tabs).toHaveLength(3);
    // The second crop inherited 9 from the crop tab it was taken from...
    expect(s().params.pixelate).toBe(9);
    // ...while the full view still holds the 3 it had before any of this.
    expect(s().tabs[0].params.pixelate).toBe(3);
    // The edit landed on the tab that was active at the time, not on its parent.
    expect(s().tabs[1].params.pixelate).toBe(9);
  });

  it('nested crops compose rather than replace', () => {
    s().commitCrop(HALF);
    s().commitCrop(HALF);
    expect(s().params.crop).toEqual({ x: 0, y: 0, w: 0.25, h: 0.25 });
  });
});

describe('tab lifecycle', () => {
  it('closing a tab restores the full view own settings', () => {
    s().setParam('cols', 111);
    s().commitCrop(HALF);
    s().setParam('cols', 222);

    s().closeTab(s().activeTabId);
    expect(s().activeTabId).toBe(FULL_TAB_ID);
    expect(s().params.cols).toBe(111);
    expect(s().params.crop).toBeNull();
  });

  it('the full tab cannot be closed', () => {
    s().closeTab(FULL_TAB_ID);
    expect(s().tabs).toHaveLength(1);
  });

  it('closing an inactive tab leaves the active one alone', () => {
    s().commitCrop(HALF);
    const first = s().activeTabId;
    s().selectTab(FULL_TAB_ID);
    s().commitCrop({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 });
    const second = s().activeTabId;

    s().closeTab(first);
    expect(s().activeTabId).toBe(second);
    expect(s().tabs).toHaveLength(2);
  });

  it('committing a crop closes the overlay', () => {
    s().setCropping(true);
    s().commitCrop(HALF);
    expect(s().cropping).toBe(false);
  });

  it('an empty selection closes the overlay without making a tab', () => {
    s().setCropping(true);
    s().commitCrop(null);
    expect(s().cropping).toBe(false);
    expect(s().tabs).toHaveLength(1);
  });

  // Reset is about the look; silently un-cropping would turn the view into a different image.
  it('reset keeps this tab framing', () => {
    s().commitCrop(HALF);
    s().setParam('brightness', 99);
    s().resetParams();
    expect(s().params.brightness).toBe(DEFAULT_PARAMS.brightness);
    expect(s().params.crop).toEqual(HALF);
  });

  it('reset on the full view leaves it uncropped', () => {
    s().setParam('brightness', 99);
    s().resetParams();
    expect(s().params.crop).toBeNull();
  });
});
