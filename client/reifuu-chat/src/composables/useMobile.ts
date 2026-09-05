import { ref, onMounted, onUnmounted } from 'vue'

const MOBILE_BREAKPOINT = 768

export function useMobile() {
  const isMobile = ref(false)
  const isTablet = ref(false)
  const isDesktop = ref(true)

  function checkDevice() {
    const width = window.innerWidth
    isMobile.value = width < MOBILE_BREAKPOINT
    isTablet.value = width >= MOBILE_BREAKPOINT && width < 1024
    isDesktop.value = width >= 1024
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(checkDevice, 100)
  }

  onMounted(() => {
    checkDevice()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    window.removeEventListener('resize', onResize)
  })

  return {
    isMobile,
    isTablet,
    isDesktop,
  }
}
