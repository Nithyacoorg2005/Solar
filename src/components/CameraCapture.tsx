import {
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';

import {
  Camera,
  RefreshCw,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  CloudSun,
  Droplets,
  ScanSearch,
} from 'lucide-react';

import { runInspection } from '@/lib/inspectionApi';

import {
  ensureNotificationPermission,
  sendFaultNotification,
} from '@/lib/notificationService';

import { isModelConnected } from '@/lib/modelAdapter';

import type {
  CleaningDecision,
  Inspection,
  WeatherSnapshot,
} from '@/types';

import {
  ErrorBanner,
  FaultBadge,
  ConfidenceBar,
} from './StatusBadges';


// ============================================================
// TYPES
// ============================================================

type CapturePhase =
  | 'idle'
  | 'preview'
  | 'processing'
  | 'success'
  | 'error';


// ============================================================
// PROPS
// ============================================================

interface CameraCaptureProps {

  panelId: string;

  /*
   * TRUE only when App.tsx has detected
   * that the configured schedule has arrived.
   *
   * FALSE when the user simply opens
   * the camera manually.
   */
  scheduledCapture: boolean;

  onInspectionComplete: (
    inspection: Inspection
  ) => void;
}


// ============================================================
// COMPONENT
// ============================================================

export function CameraCapture({

  panelId,

  scheduledCapture,

  onInspectionComplete,

}: CameraCaptureProps) {


  // ==========================================================
  // STATE
  // ==========================================================

  const [
    phase,
    setPhase,
  ] = useState<CapturePhase>('idle');


  const [
    error,
    setError,
  ] = useState<string | null>(null);


  const [
    result,
    setResult,
  ] = useState<Inspection | null>(null);


  const [
    imageDataUrl,
    setImageDataUrl,
  ] = useState<string | null>(null);


  const [
    imageBlob,
    setImageBlob,
  ] = useState<Blob | null>(null);


  const [
    cameraActive,
    setCameraActive,
  ] = useState(false);


  const [
    cameraError,
    setCameraError,
  ] = useState<string | null>(null);


  const [
    facingMode,
    setFacingMode,
  ] = useState<'environment' | 'user'>(
    'environment'
  );


  /*
   * TRUE only while scheduled automatic
   * capture is actually running.
   */
  const [
    autoCaptureEnabled,
    setAutoCaptureEnabled,
  ] = useState(false);


  const [
    captureStatus,
    setCaptureStatus,
  ] = useState(
    'Camera is ready.'
  );


  /*
   * Number of automatic captures completed.
   */
  const [
    automaticCaptureCount,
    setAutomaticCaptureCount,
  ] = useState(0);


  // ==========================================================
  // REFS
  // ==========================================================

  const videoRef =
    useRef<HTMLVideoElement>(null);


  const streamRef =
    useRef<MediaStream | null>(null);


  const fileInputRef =
    useRef<HTMLInputElement>(null);


  /*
   * 5-second automatic capture timer.
   */
  const autoCaptureTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );


  /*
   * Prevent multiple AI inspections
   * from running at the same time.
   */
  const processingRef =
    useRef(false);


  /*
   * Used to remember whether the first
   * scheduled capture has already happened.
   */
  const firstScheduledCaptureDoneRef =
    useRef(false);


  const modelConnected =
    isModelConnected();


  // ==========================================================
  // STOP AUTOMATIC CAPTURE TIMER
  // ==========================================================

  const stopAutoCaptureTimer =
    useCallback(() => {

      if (
        autoCaptureTimerRef.current
      ) {

        clearInterval(
          autoCaptureTimerRef.current
        );

        autoCaptureTimerRef.current =
          null;

      }

    }, []);


  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera =
    useCallback(() => {

      console.log(
        '[Camera] Stopping camera...'
      );


      // --------------------------------------------------------
      // Stop automatic capture
      // --------------------------------------------------------

      stopAutoCaptureTimer();


      // --------------------------------------------------------
      // Stop camera stream
      // --------------------------------------------------------

      if (
        streamRef.current
      ) {

        streamRef.current
          .getTracks()
          .forEach(
            (track) => {
              track.stop();
            }
          );


        streamRef.current =
          null;

      }


      // --------------------------------------------------------
      // Remove video stream
      // --------------------------------------------------------

      if (
        videoRef.current
      ) {

        videoRef.current.srcObject =
          null;

      }


      // --------------------------------------------------------
      // Reset camera state
      // --------------------------------------------------------

      setCameraActive(
        false
      );


      setAutoCaptureEnabled(
        false
      );


      firstScheduledCaptureDoneRef.current =
        false;


      processingRef.current =
        false;


      setCaptureStatus(
        'Camera stopped.'
      );


    }, [
      stopAutoCaptureTimer,
    ]);


  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera =
    useCallback(
      async () => {

        setCameraError(
          null
        );


        setError(
          null
        );


        setResult(
          null
        );


        setImageDataUrl(
          null
        );


        setImageBlob(
          null
        );


        setPhase(
          'idle'
        );


        /*
         * IMPORTANT:
         *
         * Starting the camera does NOT
         * start automatic capture.
         *
         * Automatic capture is controlled
         * separately by scheduledCapture.
         */

        setAutoCaptureEnabled(
          false
        );


        firstScheduledCaptureDoneRef.current =
          false;


        setCaptureStatus(
          scheduledCapture
            ? 'Scheduled inspection: connecting to DroidCam...'
            : 'Connecting to DroidCam...'
        );


        try {

          // ----------------------------------------------------
          // Browser support
          // ----------------------------------------------------

          if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
          ) {

            throw new Error(
              'Camera API is not supported by this browser.'
            );

          }


          // ----------------------------------------------------
          // Stop old stream
          // ----------------------------------------------------

          if (
            streamRef.current
          ) {

            streamRef.current
              .getTracks()
              .forEach(
                (track) => {
                  track.stop();
                }
              );


            streamRef.current =
              null;

          }


          console.log(
            '[Camera] Requesting camera access...'
          );


          // ----------------------------------------------------
          // Request camera
          // ----------------------------------------------------

          const stream =
            await navigator.mediaDevices.getUserMedia(
              {
                video: {

                  width: {
                    ideal: 1280,
                  },

                  height: {
                    ideal: 720,
                  },

                  facingMode: {
                    ideal: facingMode,
                  },

                },

                audio: false,

              }
            );


          console.log(
            '[Camera] Camera stream received:',
            stream
          );


          // ----------------------------------------------------
          // Store stream
          // ----------------------------------------------------

          streamRef.current =
            stream;


          // ----------------------------------------------------
          // Camera active
          // ----------------------------------------------------

          setCameraActive(
            true
          );


          // ----------------------------------------------------
          // Attach stream after render
          // ----------------------------------------------------

          setTimeout(
            () => {

              const video =
                videoRef.current;


              if (!video) {

                console.error(
                  '[Camera] Video element not found.'
                );


                setCameraError(
                  'Video element could not be initialized.'
                );


                return;

              }


              console.log(
                '[Camera] Attaching stream...'
              );


              video.srcObject =
                stream;


              video.onloadedmetadata =
                async () => {

                  try {

                    await video.play();


                    console.log(
                      '[Camera] Video playing:',
                      video.videoWidth,
                      'x',
                      video.videoHeight
                    );


                    /*
                     * IMPORTANT:
                     *
                     * We DO NOT start a timer here.
                     *
                     * Previously the code waited 3 seconds
                     * and enabled automatic capture here.
                     *
                     * That caused the camera to capture
                     * immediately after opening.
                     *
                     * Now we only show the live video.
                     */

                    if (
                      scheduledCapture
                    ) {

                      setCaptureStatus(
                        'Camera ready. Starting scheduled capture...'
                      );

                    } else {

                      setCaptureStatus(
                        'DroidCam connected. Live video is ready.'
                      );

                    }

                  } catch (
                    playError
                  ) {

                    console.error(
                      '[Camera] Video play error:',
                      playError
                    );


                    setCameraError(
                      'Camera connected, but the video could not start.'
                    );

                  }

                };


            },
            100
          );


        } catch (
          err
        ) {

          console.error(
            '[Camera] Camera error:',
            err
          );


          const message =
            err instanceof Error
              ? err.message
              : 'Unable to access camera.';


          if (
            message.includes(
              'NotAllowed'
            ) ||
            message.includes(
              'Permission'
            ) ||
            message.includes(
              'denied'
            )
          ) {

            setCameraError(
              'Camera permission was denied. Allow camera access in the browser and try again.'
            );


          } else if (
            message.includes(
              'NotFound'
            ) ||
            message.includes(
              'DevicesNotFound'
            )
          ) {

            setCameraError(
              'No camera was found. Make sure DroidCam Client is connected and showing your phone camera.'
            );


          } else {

            setCameraError(
              `Camera unavailable: ${message}`
            );

          }


          setCameraActive(
            false
          );

        }

      },
      [
        facingMode,
        scheduledCapture,
      ]
    );


  // ==========================================================
  // CAPTURE IMAGE FROM CAMERA
  // ==========================================================

  const captureFromCamera =
    useCallback(
      async () => {

        const video =
          videoRef.current;


        // ------------------------------------------------------
        // Video element check
        // ------------------------------------------------------

        if (!video) {

          console.log(
            '[Capture] Video element does not exist.'
          );

          return;

        }


        // ------------------------------------------------------
        // Stream check
        // ------------------------------------------------------

        if (
          !streamRef.current
        ) {

          console.log(
            '[Capture] No active camera stream.'
          );

          return;

        }


        // ------------------------------------------------------
        // Prevent overlapping inspection
        // ------------------------------------------------------

        if (
          processingRef.current
        ) {

          console.log(
            '[Capture] Inspection already running. Skipping capture.'
          );

          return;

        }


        // ------------------------------------------------------
        // Video readiness
        // ------------------------------------------------------

        if (
          video.readyState < 2
        ) {

          console.log(
            '[Capture] Video is not ready.'
          );

          return;

        }


        // ------------------------------------------------------
        // Video dimensions
        // ------------------------------------------------------

        if (
          video.videoWidth === 0 ||
          video.videoHeight === 0
        ) {

          console.log(
            '[Capture] Video has no dimensions.'
          );

          return;

        }


        console.log(
          '[Capture] Capturing frame:',
          video.videoWidth,
          'x',
          video.videoHeight
        );


        processingRef.current =
          true;


        try {

          // ----------------------------------------------------
          // Canvas
          // ----------------------------------------------------

          const canvas =
            document.createElement(
              'canvas'
            );


          canvas.width =
            video.videoWidth;


          canvas.height =
            video.videoHeight;


          const context =
            canvas.getContext(
              '2d'
            );


          if (!context) {

            processingRef.current =
              false;

            return;

          }


          // ----------------------------------------------------
          // Draw video frame
          // ----------------------------------------------------

          context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
          );


          // ----------------------------------------------------
          // Convert to JPEG
          // ----------------------------------------------------

          const blob =
            await new Promise<Blob | null>(
              (resolve) => {

                canvas.toBlob(
                  (createdBlob) => {

                    resolve(
                      createdBlob
                    );

                  },
                  'image/jpeg',
                  0.85
                );

              }
            );


          if (!blob) {

            throw new Error(
              'Could not create image blob.'
            );

          }


          console.log(
            '[Capture] PHOTO CAPTURED SUCCESSFULLY'
          );


          // ----------------------------------------------------
          // Save image
          // ----------------------------------------------------

          setImageBlob(
            blob
          );


          const dataUrl =
            canvas.toDataURL(
              'image/jpeg',
              0.85
            );


          setImageDataUrl(
            dataUrl
          );


          // ----------------------------------------------------
          // Update status
          // ----------------------------------------------------

          setCaptureStatus(
            scheduledCapture
              ? 'Photo captured. Running AI inspection...'
              : 'Photo captured. Ready for inspection.'
          );


          // ----------------------------------------------------
          // Scheduled capture
          //
          // Automatically run AI inspection.
          // ----------------------------------------------------

          if (
            scheduledCapture
          ) {

            setPhase(
              'processing'
            );


            try {

              await ensureNotificationPermission();


              const inspection =
                await runInspection(
                  panelId,
                  blob,
                  'scheduled'
                );


              // ------------------------------------------------
              // Fault notification
              // ------------------------------------------------

              if (
                inspection.is_fault &&
                inspection.processing_status ===
                  'completed'
              ) {

                await sendFaultNotification(
                  inspection
                );

              }


              // ------------------------------------------------
              // Result
              // ------------------------------------------------

              setResult(
                inspection
              );


              setPhase(
                'success'
              );


              setAutomaticCaptureCount(
                (count) =>
                  count + 1
              );


              setCaptureStatus(
                'Scheduled inspection completed. Next capture in 5 seconds.'
              );


              onInspectionComplete(
                inspection
              );


            } catch (
              err
            ) {

              console.error(
                '[Capture] Scheduled inspection failed:',
                err
              );


              setError(
                err instanceof Error
                  ? err.message
                  : 'Scheduled inspection failed.'
              );


              setPhase(
                'error'
              );


              setCaptureStatus(
                'Scheduled inspection failed. Automatic capture will continue.'
              );

            }

          } else {

            // --------------------------------------------------
            // Manual capture
            //
            // Do NOT automatically inspect.
            // User can click Run Inspection.
            // --------------------------------------------------

            setPhase(
              'preview'
            );


            setCaptureStatus(
              'Photo captured. Click Run Inspection to analyze it.'
            );

          }


        } catch (
          err
        ) {

          console.error(
            '[Capture] Capture failed:',
            err
          );


          setError(
            err instanceof Error
              ? err.message
              : 'Failed to capture image.'
          );


          setPhase(
            'error'
          );

        } finally {

          processingRef.current =
            false;

        }

      },
      [
        panelId,
        scheduledCapture,
        onInspectionComplete,
      ]
    );


  // ==========================================================
  // START / STOP SCHEDULED CAPTURE
  // ==========================================================

  useEffect(
    () => {

      /*
       * Always clear an old timer first.
       */

      stopAutoCaptureTimer();


      /*
       * Reset automatic capture state.
       */

      setAutoCaptureEnabled(
        false
      );


      /*
       * If schedule is NOT active,
       * do nothing.
       */

      if (
        !scheduledCapture
      ) {

        firstScheduledCaptureDoneRef.current =
          false;

        return;

      }


      /*
       * Schedule is active but camera
       * is not ready yet.
       *
       * startCamera() will be triggered
       * below.
       */

      if (
        !cameraActive
      ) {

        setCaptureStatus(
          'Scheduled inspection is waiting for camera...'
        );

        startCamera();

        return;

      }


      /*
       * Camera is ready.
       *
       * Start automatic capture.
       */

      console.log(
        '[Scheduled Capture] Camera is ready.'
      );


      setAutoCaptureEnabled(
        true
      );


      setCaptureStatus(
        'Scheduled capture is active. Capturing first image...'
      );


      /*
       * First capture immediately after
       * the camera becomes ready.
       *
       * No arbitrary 3-second timer.
       */

      if (
        !firstScheduledCaptureDoneRef.current
      ) {

        firstScheduledCaptureDoneRef.current =
          true;


        /*
         * Give the browser one frame to
         * ensure the video is rendering.
         */

        const firstCaptureTimer =
          window.setTimeout(
            () => {

              if (
                streamRef.current
              ) {

                captureFromCamera();

              }

            },
            500
          );


        /*
         * After the first capture, the
         * interval below handles subsequent
         * captures every 5 seconds.
         */

        autoCaptureTimerRef.current =
          window.setInterval(
            () => {

              if (
                streamRef.current &&
                !processingRef.current
              ) {

                captureFromCamera();

              }

            },
            5_000
          );


        return () => {

          window.clearTimeout(
            firstCaptureTimer
          );

          stopAutoCaptureTimer();

        };

      }


      /*
       * Safety fallback.
       */

      autoCaptureTimerRef.current =
        window.setInterval(
          () => {

            if (
              streamRef.current &&
              !processingRef.current
            ) {

              captureFromCamera();

            }

          },
          5_000
        );


      return () => {

        stopAutoCaptureTimer();

      };

    },
    [
      scheduledCapture,
      cameraActive,
      startCamera,
      captureFromCamera,
      stopAutoCaptureTimer,
    ]
  );


  // ==========================================================
  // CLEANUP
  // ==========================================================

  useEffect(
    () => {

      return () => {

        stopAutoCaptureTimer();


        if (
          streamRef.current
        ) {

          streamRef.current
            .getTracks()
            .forEach(
              (track) => {
                track.stop();
              }
            );

          streamRef.current =
            null;

        }

      };

    },
    [
      stopAutoCaptureTimer,
    ]
  );


  // ==========================================================
  // SWITCH CAMERA
  // ==========================================================

  const switchCamera =
    useCallback(
      () => {

        /*
         * Stop current stream.
         */

        if (
          streamRef.current
        ) {

          streamRef.current
            .getTracks()
            .forEach(
              (track) => {
                track.stop();
              }
            );

          streamRef.current =
            null;

        }


        setCameraActive(
          false
        );


        setFacingMode(
          (mode) =>
            mode === 'environment'
              ? 'user'
              : 'environment'
        );

      },
      []
    );


  // ==========================================================
  // MANUAL INSPECTION
  // ==========================================================

  const runInspectionPipeline =
    async () => {

      if (
        !imageBlob
      ) {

        return;

      }


      /*
       * Don't manually run while
       * scheduled inspection is processing.
       */

      if (
        processingRef.current
      ) {

        return;

      }


      processingRef.current =
        true;


      setPhase(
        'processing'
      );


      setError(
        null
      );


      try {

        await ensureNotificationPermission();


        const inspection =
          await runInspection(
            panelId,
            imageBlob,
            'manual'
          );


        if (
          inspection.is_fault &&
          inspection.processing_status ===
            'completed'
        ) {

          await sendFaultNotification(
            inspection
          );

        }


        setResult(
          inspection
        );


        setPhase(
          'success'
        );


        setCaptureStatus(
          'Inspection completed.'
        );


        onInspectionComplete(
          inspection
        );


      } catch (
        err
      ) {

        console.error(
          '[Manual Inspection] Failed:',
          err
        );


        setError(
          err instanceof Error
            ? err.message
            : 'Inspection failed unexpectedly.'
        );


        setPhase(
          'error'
        );

      } finally {

        processingRef.current =
          false;

      }

    };


  // ==========================================================
  // FILE UPLOAD
  // ==========================================================

  const handleFileUpload =
    (
      event:
        React.ChangeEvent<HTMLInputElement>
    ) => {

      const file =
        event.target.files?.[0];


      if (!file) {

        return;

      }


      if (
        !file.type.startsWith(
          'image/'
        )
      ) {

        setError(
          'Please select an image file.'
        );

        return;

      }


      /*
       * Stop camera if running.
       */

      stopCamera();


      const reader =
        new FileReader();


      reader.onload = () => {

        setImageDataUrl(
          reader.result as string
        );


        setImageBlob(
          file
        );


        setPhase(
          'preview'
        );


        setError(
          null
        );


        setCaptureStatus(
          'Image uploaded. Click Run Inspection to analyze it.'
        );

      };


      reader.onerror = () => {

        setError(
          'Failed to read the selected image.'
        );

      };


      reader.readAsDataURL(
        file
      );

    };


  // ==========================================================
  // RESET
  // ==========================================================

  const resetCapture =
    () => {

      stopCamera();


      setImageDataUrl(
        null
      );


      setImageBlob(
        null
      );


      setResult(
        null
      );


      setError(
        null
      );


      setCameraError(
        null
      );


      setPhase(
        'idle'
      );


      setAutomaticCaptureCount(
        0
      );


      setCaptureStatus(
        'Camera is ready.'
      );


      /*
       * Clear file input so the same
       * image can be selected again.
       */

      if (
        fileInputRef.current
      ) {

        fileInputRef.current.value =
          '';

      }

    };


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div className="max-w-2xl mx-auto">


      {/* ======================================================
          MODEL WARNING
          ====================================================== */}

      {!modelConnected &&
        phase === 'idle' && (

          <div className="mb-6 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 animate-fade-in">

            <strong className="font-semibold">

              Model not connected.

            </strong>

            {' '}

            The AI inference service URL is not configured.

            {' '}

            You can still capture and store images,
            but predictions will be marked as failed
            until

            <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded font-mono text-xs">

              VITE_MODEL_INFERENCE_URL

            </code>

            is set in the environment.

          </div>

        )}


      {/* ======================================================
          SCHEDULE STATUS
          ====================================================== */}

      {scheduledCapture && (

        <div className="mb-6 px-5 py-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">

          <div className="flex items-center gap-2">

            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />

            <strong>

              Scheduled inspection active

            </strong>

          </div>


          <p className="mt-1 ml-4 text-xs">

            The system will capture an image every
            5 seconds while the scheduled inspection
            is active.

          </p>


          {automaticCaptureCount > 0 && (

            <p className="mt-1 ml-4 text-xs">

              Captures completed:
              {' '}
              {automaticCaptureCount}

            </p>

          )}

        </div>

      )}


      {/* ======================================================
          ERROR
          ====================================================== */}

      {error && (

        <div className="mb-6">

          <ErrorBanner
            message={error}
            onDismiss={() =>
              setError(null)
            }
          />

        </div>

      )}


      {/* ======================================================
          CAMERA / IDLE
          ====================================================== */}

      {phase === 'idle' && (

        <div className="space-y-4 animate-fade-in">


          {/* CAMERA ERROR */}

          {cameraError && (

            <div className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">

              {cameraError}

            </div>

          )}


          {/* ==================================================
              LIVE CAMERA
              ================================================== */}

          {cameraActive && (

            <div className="relative bg-ink-950 rounded-2xl overflow-hidden animate-scale-in">

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-video object-cover"
              />


              {/* STATUS */}

              <div className="absolute top-3 left-3">

                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur text-white text-xs rounded-full">

                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />

                  {autoCaptureEnabled
                    ? 'AUTO CAPTURE ACTIVE'
                    : 'LIVE'}

                </div>

              </div>


              {/* CAMERA CONTROLS */}

              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">

                {/* MANUAL CAPTURE */}

                {!scheduledCapture && (

                  <button
                    onClick={() =>
                      captureFromCamera()
                    }
                    disabled={
                      processingRef.current
                    }
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-ink-900 text-sm font-medium rounded-xl hover:bg-ink-100 transition-colors disabled:opacity-50"
                  >

                    <Camera
                      size={16}
                    />

                    Capture Photo

                  </button>

                )}


                {/* SWITCH CAMERA */}

                <button
                  onClick={
                    switchCamera
                  }
                  className="flex items-center gap-2 px-3 py-2.5 bg-white/90 text-ink-900 text-sm rounded-xl hover:bg-white transition-colors"
                  title="Switch camera"
                >

                  <RefreshCw
                    size={16}
                  />

                </button>


                {/* STOP */}

                <button
                  onClick={
                    stopCamera
                  }
                  className="flex items-center gap-2 px-3 py-2.5 bg-white/90 text-ink-900 text-sm rounded-xl hover:bg-white transition-colors"
                  title="Stop camera"
                >

                  <X
                    size={16}
                  />

                </button>

              </div>

            </div>

          )}


          {/* ==================================================
              CAMERA STATUS
              ================================================== */}

          <div className="px-4 py-3 bg-ink-100 rounded-xl text-sm text-ink-600">

            <div className="flex items-center gap-2">

              {autoCaptureEnabled ? (

                <Loader2
                  size={16}
                  className="animate-spin"
                />

              ) : (

                <Camera
                  size={16}
                />

              )}


              <span>

                {captureStatus}

              </span>

            </div>

          </div>


          {/* ==================================================
              START CAMERA / UPLOAD
              ================================================== */}

          {!cameraActive && (

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


              {/* CAMERA */}

              <button
                onClick={
                  startCamera
                }
                className="group flex flex-col items-center gap-3 py-12 border-2 border-ink-200 rounded-2xl hover:border-ink-900 hover:bg-ink-50 transition-all"
              >

                <div className="w-12 h-12 rounded-full bg-ink-100 group-hover:bg-ink-900 flex items-center justify-center transition-colors">

                  <Camera
                    size={22}
                    className="text-ink-600 group-hover:text-white transition-colors"
                  />

                </div>


                <span className="text-sm font-medium text-ink-700">

                  Use Phone Camera

                </span>


                <span className="text-xs text-ink-400">

                  DroidCam • live capture

                </span>

              </button>


              {/* UPLOAD */}

              <button
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="group flex flex-col items-center gap-3 py-12 border-2 border-ink-200 rounded-2xl hover:border-ink-900 hover:bg-ink-50 transition-all"
              >

                <div className="w-12 h-12 rounded-full bg-ink-100 group-hover:bg-ink-900 flex items-center justify-center transition-colors">

                  <Upload
                    size={22}
                    className="text-ink-600 group-hover:text-white transition-colors"
                  />

                </div>


                <span className="text-sm font-medium text-ink-700">

                  Upload Image

                </span>


                <span className="text-xs text-ink-400">

                  Select from device

                </span>

              </button>


              <input
                ref={
                  fileInputRef
                }
                type="file"
                accept="image/*"
                capture="environment"
                onChange={
                  handleFileUpload
                }
                className="hidden"
              />

            </div>

          )}

        </div>

      )}


      {/* ======================================================
          PREVIEW
          ====================================================== */}

      {phase === 'preview' &&
        imageDataUrl && (

          <div className="space-y-5 animate-fade-in">


            <div className="bg-ink-950 rounded-2xl overflow-hidden">

              <img
                src={
                  imageDataUrl
                }
                alt="Captured solar panel"
                className="w-full object-contain max-h-[450px]"
              />

            </div>


            <div className="flex gap-3">

              <button
                onClick={
                  runInspectionPipeline
                }
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-ink-900 text-white text-sm font-medium rounded-xl hover:bg-ink-800 transition-colors"
              >

                <ScanSearch
                  size={16}
                />

                Run Inspection

              </button>


              <button
                onClick={
                  resetCapture
                }
                className="px-4 py-3 border border-ink-200 text-ink-600 text-sm font-medium rounded-xl hover:bg-ink-50 transition-colors"
              >

                <RefreshCw
                  size={16}
                />

              </button>

            </div>

          </div>

        )}


      {/* ======================================================
          PROCESSING
          ====================================================== */}

      {phase === 'processing' && (

        <div className="space-y-5 animate-fade-in">

          {imageDataUrl && (

            <div className="bg-ink-950 rounded-2xl overflow-hidden">

              <img
                src={
                  imageDataUrl
                }
                alt="Processing solar panel"
                className="w-full object-contain max-h-[450px] opacity-70"
              />

            </div>

          )}


          <div className="flex items-center justify-center gap-3 px-5 py-4 bg-ink-100 rounded-xl text-sm text-ink-600">

            <Loader2
              size={18}
              className="animate-spin"
            />

            <span>

              Analyzing solar panel image...

            </span>

          </div>

        </div>

      )}


      {/* ======================================================
          SUCCESS
          ====================================================== */}

      {phase === 'success' &&
        result && (

          <div className="space-y-5 animate-fade-in">


            {/* IMAGE */}

            {imageDataUrl && (

              <div className="bg-ink-950 rounded-2xl overflow-hidden">

                <img
                  src={
                    imageDataUrl
                  }
                  alt="Inspected solar panel"
                  className="w-full object-contain max-h-[450px]"
                />

              </div>

            )}


            {/* RESULT */}

            <div className="bg-white border border-ink-200 rounded-2xl p-5">

              <div className="flex items-center justify-between mb-4">

                <div className="flex items-center gap-2">

                  <CheckCircle2
                    size={20}
                    className="text-green-600"
                  />

                  <h3 className="font-semibold text-ink-900">

                    Inspection Result

                  </h3>

                </div>


                <FaultBadge
                  isFault={
                    result.is_fault
                  }
                />

              </div>


              <div className="space-y-4">


                {/* PREDICTION */}

                <div>

                  <p className="text-xs text-ink-400 mb-1">

                    Prediction

                  </p>

                  <p className="text-sm font-medium text-ink-900">

                    {result.prediction ||
                      result.fault_type ||
                      'Unknown'}

                  </p>

                </div>


                {/* CONFIDENCE */}

                {typeof result.confidence ===
                  'number' && (

                  <div>

                    <p className="text-xs text-ink-400 mb-2">

                      Confidence

                    </p>

                    <ConfidenceBar
                      confidence={
                        result.confidence
                      }
                    />

                  </div>

                )}


                {/* WEATHER */}

                {(
                  result.raw_output as {
                    weather?: WeatherSnapshot;
                  } | null
                )?.weather && (

                  <div className="pt-3 border-t border-ink-100">

                    <div className="flex items-center gap-2 mb-2">

                      <CloudSun
                        size={16}
                        className="text-ink-400"
                      />

                      <span className="text-xs font-medium text-ink-600">

                        Weather

                      </span>

                    </div>


                    <div className="grid grid-cols-2 gap-3 text-xs">

                      <div>

                        <span className="text-ink-400">

                          Temperature

                        </span>

                        <p className="font-medium">

                          {
                            (
                              result.raw_output as {
                                weather?: WeatherSnapshot;
                              }
                            ).weather
                              ?.temperature
                          }
                          °C

                        </p>

                      </div>


                      <div>

                        <span className="text-ink-400">

                          Rain

                        </span>

                        <p className="font-medium">

                          {
                            (
                              result.raw_output as {
                                weather?: WeatherSnapshot;
                              }
                            ).weather
                              ?.precipitation
                          }
                          mm

                        </p>

                      </div>

                    </div>

                  </div>

                )}


                {/* CLEANING DECISION */}

                {(
                  result.raw_output as {
                    cleaning_decision?: CleaningDecision;
                  } | null
                )?.cleaning_decision && (

                  <div className="pt-3 border-t border-ink-100">

                    <div className="flex items-center gap-2 mb-2">

                      <Droplets
                        size={16}
                        className="text-ink-400"
                      />

                      <span className="text-xs font-medium text-ink-600">

                        Cleaning Decision

                      </span>

                    </div>


                    <p className="text-sm font-medium text-ink-900">

                      {
                        (
                          result.raw_output as {
                            cleaning_decision?: CleaningDecision;
                          }
                        ).cleaning_decision
                          ?.label
                      }

                    </p>


                    <p className="mt-1 text-xs text-ink-500">

                      {
                        (
                          result.raw_output as {
                            cleaning_decision?: CleaningDecision;
                          }
                        ).cleaning_decision
                          ?.reason
                      }

                    </p>

                  </div>

                )}

              </div>

            </div>


            {/* ACTIONS */}

            <div className="flex gap-3">

              <button
                onClick={
                  resetCapture
                }
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-ink-900 text-white text-sm font-medium rounded-xl hover:bg-ink-800 transition-colors"
              >

                <Camera
                  size={16}
                />

                New Inspection

              </button>

            </div>


            {/* SCHEDULE INFO */}

            {scheduledCapture && (

              <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800">

                Scheduled inspection is still active.
                The next image will be captured automatically
                in approximately 5 seconds.

              </div>

            )}

          </div>

        )}


      {/* ======================================================
          ERROR PHASE
          ====================================================== */}

      {phase === 'error' && (

        <div className="space-y-5 animate-fade-in">

          <div className="flex flex-col items-center justify-center py-12 px-6 bg-red-50 border border-red-200 rounded-2xl text-center">

            <AlertCircle
              size={32}
              className="text-red-500 mb-3"
            />


            <h3 className="text-base font-semibold text-red-900">

              Inspection Failed

            </h3>


            <p className="mt-1 text-sm text-red-700">

              {error ||
                'Something went wrong while processing the image.'}

            </p>

          </div>


          <div className="flex gap-3">

            <button
              onClick={
                resetCapture
              }
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-ink-900 text-white text-sm font-medium rounded-xl hover:bg-ink-800 transition-colors"
            >

              <RefreshCw
                size={16}
              />

              Try Again

            </button>

          </div>

        </div>

      )}

    </div>

  );

}