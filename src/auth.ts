// Ідентифікація гравця: гість одразу → вхід за листом-посиланням або Google.
import { initializeApp } from 'firebase/app'
import {
  getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider,
  linkWithPopup, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink,
  signInWithEmailLink, linkWithCredential, EmailAuthProvider, signOut, type User,
} from 'firebase/auth'

const env = import.meta.env
const cfg = {
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  appId: env.VITE_FB_APP_ID,
}

/** Чи задано конфіг Firebase (інакше гра працює повністю локально). */
export const authEnabled = !!(cfg.apiKey && cfg.projectId && cfg.appId)
const auth = authEnabled ? getAuth(initializeApp(cfg)) : null
const EMAIL_KEY = 'ap_signin_email'

export type Who = { uid: string; email: string | null; guest: boolean } | null
const toWho = (u: User | null): Who => u ? { uid: u.uid, email: u.email, guest: u.isAnonymous } : null

/** Підписка на стан входу; якщо користувача нема — одразу створює гостя. */
export function watchAuth(cb: (w: Who) => void): () => void {
  if (!auth) { cb(null); return () => {} }
  return onAuthStateChanged(auth, u => {
    if (!u) { signInAnonymously(auth).catch(() => cb(null)); return }
    cb(toWho(u))
  })
}

/** Вхід через Google: гостя «підвищуємо», зберігаючи uid і прогрес. */
export async function googleIn() {
  if (!auth) return
  const p = new GoogleAuthProvider()
  const u = auth.currentUser
  try { if (u?.isAnonymous) await linkWithPopup(u, p); else await signInWithPopup(auth, p) }
  catch (e: any) { if (e?.code === 'auth/credential-already-in-use') await signInWithPopup(auth, p); else throw e }
}

/** Надіслати лист із посиланням для входу. */
export async function emailSend(email: string) {
  if (!auth) return
  await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true })
  try { localStorage.setItem(EMAIL_KEY, email) } catch {}
}

/** Якщо сторінку відкрито за посиланням із листа — завершити вхід. */
export async function emailFinish() {
  if (!auth || !isSignInWithEmailLink(auth, location.href)) return
  let email: string | null = null
  try { email = localStorage.getItem(EMAIL_KEY) } catch {}
  if (!email) email = prompt('Введіть пошту, на яку надійшов лист')
  if (!email) return
  const u = auth.currentUser
  try {
    if (u?.isAnonymous) await linkWithCredential(u, EmailAuthProvider.credentialWithLink(email, location.href))
    else await signInWithEmailLink(auth, email, location.href)
  } catch { await signInWithEmailLink(auth, email, location.href) }
  try { localStorage.removeItem(EMAIL_KEY) } catch {}
  history.replaceState(null, '', location.pathname)
}

export const logout = () => auth ? signOut(auth) : Promise.resolve()
