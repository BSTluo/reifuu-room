import { type Component } from 'vue'
import MusicPlayer from './MusicPlayer.vue'
import VideoPlayer from './VideoPlayer.vue'

/** 插件元数据 */
export interface PluginMeta {
  id: string
  name: string
  icon: string
  description: string
  component: Component
}

/** 内建插件注册表 */
export const BUILTIN_PLUGINS: PluginMeta[] = [
  {
    id: 'music-sync',
    name: '一起听歌',
    icon: '🎵',
    description: '房间内同步播放音乐',
    component: MusicPlayer,
  },
  {
    id: 'video-sync',
    name: '一起看视频',
    icon: '🎬',
    description: '房间内同步观看 YouTube 视频',
    component: VideoPlayer,
  },
]

/** 根据 pluginId 获取插件元数据 */
export function getPluginMeta(pluginId: string): PluginMeta | undefined {
  return BUILTIN_PLUGINS.find((p) => p.id === pluginId)
}
