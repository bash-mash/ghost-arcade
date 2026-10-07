<script lang="ts">
  /**
   * ScreenOutlinesOverlay — read-only outlines of every enabled output
   * Screen, shown on the editor canvas while the user works on layers.
   * The Screens tab has its own interactive version (ScreenWarpHandles);
   * this one just keeps the split between projectors visible so layers
   * can be placed on the right screen. Never intercepts the mouse.
   *
   * Screen geometry is master-canvas normalized 0..1 with y=0 at the top,
   * the same coordinate system ScreenWarpHandles uses.
   */
  import { screens } from '../stores/screens';

  interface Props {
    containerWidth: number;
    containerHeight: number;
  }

  let { containerWidth, containerHeight }: Props = $props();

  const enabledScreens = $derived($screens.filter((s) => s.enabled));
</script>

{#if enabledScreens.length > 0}
  <svg class="screen-outlines" width={containerWidth} height={containerHeight}>
    {#each enabledScreens as s (s.id)}
      {@const x = s.cropX * containerWidth}
      {@const y = s.cropY * containerHeight}
      {@const w = s.cropW * containerWidth}
      {@const h = s.cropH * containerHeight}
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width={Math.max(0, w - 1)}
        height={Math.max(0, h - 1)}
        fill="none"
        stroke="rgba(187, 134, 252, 0.55)"
        stroke-width="1.5"
        stroke-dasharray="6 4"
      />
      <!-- Screen name, centred along the top edge. -->
      <text
        x={x + w / 2}
        y={y + 18}
        text-anchor="middle"
        fill="rgba(187, 134, 252, 0.9)"
        font-size="12"
        font-family="IBM Plex Mono, ui-monospace, monospace"
        paint-order="stroke"
        stroke="rgba(0, 0, 0, 0.7)"
        stroke-width="3"
      >{s.name}</text>
    {/each}
  </svg>
{/if}

<style>
  .screen-outlines {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
  }
</style>
