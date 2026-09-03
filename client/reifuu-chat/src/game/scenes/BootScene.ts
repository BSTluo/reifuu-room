import Phaser from 'phaser'

/**
 * 初始化配置，进入 PreloadScene 前的最小启动场景。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload(): void {
    // Phase 0 阶段暂无需要预加载的启动资源
  }

  create(): void {
    this.scene.start('PreloadScene')
  }
}
