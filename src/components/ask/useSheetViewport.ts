import { useEffect } from 'react'

/* An Ask drawer on a phone is a bottom sheet (22 Oct, his "when I focus
   input it looks a bit ugly and when I scroll we scroll entire
   viewport"). While it is open: the page under it does not scroll
   (`ask-open` on <html>), and the sheet sits on the keyboard and fits
   what is left of the screen — iOS keeps a fixed sheet at the bottom of
   the page, behind the keyboard, so `--ask-kb` lifts it and `--ask-vh`
   caps its height (insights-tabs.css). Read from visualViewport, the part
   of the page the keyboard leaves visible. */

const PHONE = '(max-width: 640px)'

export function useSheetViewport(open: boolean) {
  useEffect(() => {
    if (!open || !window.matchMedia(PHONE).matches) return
    const root = document.documentElement
    const vv = window.visualViewport
    const fit = () => {
      if (!vv) return
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--ask-kb', `${Math.round(kb)}px`)
      root.style.setProperty('--ask-vh', `${Math.round(vv.height)}px`)
    }
    root.classList.add('ask-open')
    fit()
    vv?.addEventListener('resize', fit)
    vv?.addEventListener('scroll', fit)
    return () => {
      root.classList.remove('ask-open')
      root.style.removeProperty('--ask-kb')
      root.style.removeProperty('--ask-vh')
      vv?.removeEventListener('resize', fit)
      vv?.removeEventListener('scroll', fit)
    }
  }, [open])
}
