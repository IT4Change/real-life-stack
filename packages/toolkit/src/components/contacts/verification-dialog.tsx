"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { QrCode, Copy, Check, Loader2, Camera, ChevronDown, ChevronUp, X } from "lucide-react"

import { Button } from "@/components/primitives/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/primitives/dialog"

type VerificationStep = "ready" | "confirm" | "done" | "error"

export interface VerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  challenge: { code: string; nonce: string } | null
  peerInfo: { peerId: string; peerName?: string; peerAvatar?: string } | null
  isProcessing: boolean
  error: string | null
  onCreateChallenge: () => Promise<unknown>
  onScanChallenge: (code: string) => Promise<unknown>
  onConfirmVerification: (code: string) => Promise<void>
  onReset: () => void
}

export function VerificationDialog({
  open,
  onOpenChange,
  challenge,
  peerInfo,
  isProcessing,
  error,
  onCreateChallenge,
  onScanChallenge,
  onConfirmVerification,
  onReset,
}: VerificationDialogProps) {
  const [step, setStep] = useState<VerificationStep>("ready")
  const [copied, setCopied] = useState(false)
  const [scannedCode, setScannedCode] = useState("")
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<{ stream: MediaStream | null }>({ stream: null })
  const challengeCreated = useRef(false)

  // Auto-create challenge when dialog opens
  useEffect(() => {
    if (open && !challenge && !challengeCreated.current) {
      challengeCreated.current = true
      onCreateChallenge()
    }
    if (!open) {
      challengeCreated.current = false
    }
  }, [open, challenge, onCreateChallenge])

  // Generate QR code when challenge changes
  useEffect(() => {
    if (!challenge?.code) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    import("qrcode").then((QRCode) => {
      if (cancelled) return
      QRCode.toDataURL(challenge.code, {
        width: 220,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      }).then((url: string) => {
        if (!cancelled) setQrDataUrl(url)
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [challenge?.code])

  const stopScanner = useCallback(() => {
    if (scannerRef.current.stream) {
      for (const track of scannerRef.current.stream.getTracks()) {
        track.stop()
      }
      scannerRef.current.stream = null
    }
    // Release the stream from the <video> element too — stopping the tracks
    // alone leaves some browsers holding the camera "warm" (LED stays on).
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }, [])

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setStep("ready")
      setCopied(false)
      setScannedCode("")
      setShowManualEntry(false)
      setManualCode("")
      setQrDataUrl(null)
      stopScanner()
      onReset()
    }
    onOpenChange(isOpen)
  }, [onOpenChange, onReset, stopScanner])

  const handleCopy = async () => {
    if (challenge?.code) {
      await navigator.clipboard.writeText(challenge.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const processScannedCode = async (code: string) => {
    setScannedCode(code)
    await onScanChallenge(code)
    setStep("confirm")
  }

  const startScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      scannerRef.current.stream = stream
      setIsScanning(true)
    } catch {
      // Camera not available — show manual entry instead
      setIsScanning(false)
      setShowManualEntry(true)
    }
  }

  const handleManualSubmit = async () => {
    const code = manualCode.trim()
    if (!code) return
    await processScannedCode(code)
  }

  const handleConfirm = async () => {
    await onConfirmVerification(scannedCode)
    setStep("done")
  }

  const handleAnother = async () => {
    setStep("ready")
    setCopied(false)
    setScannedCode("")
    setShowManualEntry(false)
    setManualCode("")
    onReset()
    challengeCreated.current = true
    await onCreateChallenge()
  }

  // Assign stream to video element after React renders it
  useEffect(() => {
    if (!isScanning || !videoRef.current || !scannerRef.current.stream) return
    const video = videoRef.current
    video.srcObject = scannerRef.current.stream

    if (!("BarcodeDetector" in window)) return
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] })
    const scanFrame = async () => {
      if (!videoRef.current || !scannerRef.current.stream) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue
          stopScanner()
          await processScannedCode(code)
          return
        }
      } catch { /* ignore detection errors */ }
      if (scannerRef.current.stream) {
        requestAnimationFrame(scanFrame)
      }
    }
    video.addEventListener("loadeddata", () => requestAnimationFrame(scanFrame), { once: true })
  }, [isScanning, stopScanner])

  // Stop the camera whenever the dialog is no longer open — covers every close
  // path (onOpenChange/escape, and the direct setVerifyDialogOpen(false) in
  // App.tsx that bypasses handleClose) — plus a final cleanup on unmount.
  useEffect(() => {
    if (!open) stopScanner()
    return () => stopScanner()
  }, [open, stopScanner])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {step === "done" ? "Verifizierung gesendet" : "Verifizieren"}
          </DialogTitle>
          {step === "ready" && (
            <DialogDescription className="text-center">
              Zeige deinen Code oder scanne den Code deines Gegenübers.
            </DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {step === "ready" && (
          <div className="space-y-4">
            {/* QR Code or Camera Scanner */}
            {isScanning ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg border bg-black aspect-square object-cover"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full"
                  onClick={stopScanner}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : qrDataUrl ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="rounded-xl border bg-white p-3 shadow-sm">
                  <img src={qrDataUrl} alt="QR Code" className="w-[220px] h-[220px]" />
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!challenge?.code}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {copied ? (
                    <><Check className="h-3 w-3 text-green-500" /> Kopiert</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Code kopieren</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="rounded-xl border bg-muted p-3 w-[246px] h-[246px] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <Button
              size="sm"
              className="w-full"
              onClick={startScanner}
              disabled={isScanning}
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              Scannen
            </Button>

            {/* Manual entry toggle */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowManualEntry(!showManualEntry)}
              >
                {showManualEntry ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Code manuell eingeben
              </button>
              {showManualEntry && (
                <div className="flex gap-2 mt-2">
                  <textarea
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Code hier einfügen..."
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button
                    size="sm"
                    onClick={handleManualSubmit}
                    disabled={!manualCode.trim() || isProcessing}
                    className="self-end"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && peerInfo && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-center text-muted-foreground">
              Stehst du gerade vor dieser Person?
            </p>
            <div className="rounded-lg border bg-primary/5 p-4 text-center">
              <Avatar className="mx-auto mb-2 h-12 w-12">
                <AvatarImage src={peerInfo.peerAvatar} alt={peerInfo.peerName ?? ""} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {(peerInfo.peerName ?? peerInfo.peerId.slice(-6)).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="font-medium">
                {peerInfo.peerName ?? `User-${peerInfo.peerId.slice(-6)}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {peerInfo.peerId.slice(0, 20)}...{peerInfo.peerId.slice(-8)}
              </p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Bestätige nur, wenn du diese Person persönlich kennst.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("ready")}>
                Zurück
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Bestätigen
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 pt-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">
              {peerInfo?.peerName
                ? `Warte auf Verifizierung von ${peerInfo.peerName}...`
                : "Warte auf Verifizierung der Gegenseite..."}
            </p>
            <Button variant="outline" className="w-full" onClick={() => handleClose(false)}>
              Im Hintergrund warten
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 pt-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <X className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">
              Die Verifizierung ist fehlgeschlagen.
            </p>
            <Button className="w-full" onClick={handleAnother}>
              Erneut versuchen
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
