import { useCallback, useState } from "react"
import { hasEncounterVerification } from "@real-life-stack/data-interface"
import type { EncounterPeerInfo, VerificationChallenge } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

const NOOP_VERIFICATION = {
  supported: false as const,
  challenge: null,
  peerInfo: null,
  isProcessing: false,
  error: null,
  createChallenge: async () => null,
  scanChallenge: async (_code: string) => null,
  confirmVerification: async (_code: string) => {},
  reset: () => {},
}

export function useVerification() {
  const connector = useConnector()
  const supported = hasEncounterVerification(connector)
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [peerInfo, setPeerInfo] = useState<EncounterPeerInfo | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createChallenge = useCallback(async () => {
    if (!supported) return null
    setError(null)
    setChallenge(null)
    setPeerInfo(null)
    setIsProcessing(true)
    try {
      const result = await connector.createVerificationChallenge()
      setChallenge(result)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : "Challenge creation failed")
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [connector, supported])

  const scanChallenge = useCallback(async (code: string) => {
    if (!supported) return null
    setError(null)
    setChallenge(null)
    setPeerInfo(null)
    setIsProcessing(true)
    try {
      const info = await connector.prepareVerificationResponse(code)
      setPeerInfo(info)
      return info
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid challenge code")
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [connector, supported])

  const confirmVerification = useCallback(async (code: string) => {
    if (!supported) return
    setError(null)
    setIsProcessing(true)
    try {
      await connector.confirmVerificationResponse(code)
      setChallenge(null)
      setPeerInfo(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed")
    } finally {
      setIsProcessing(false)
    }
  }, [connector, supported])

  const reset = useCallback(() => {
    setChallenge(null)
    setPeerInfo(null)
    setError(null)
    setIsProcessing(false)
  }, [])

  if (!supported) return NOOP_VERIFICATION

  return {
    supported: true as const,
    challenge,
    peerInfo,
    isProcessing,
    error,
    createChallenge,
    scanChallenge,
    confirmVerification,
    reset,
  }
}
