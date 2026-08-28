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


type CapturePhase =
  | 'idle'
  | 'preview'
  | 'processing'
  | 'success'
  | 'error';


interface CameraCaptureProps {
  panelId: string;
  onInspectionComplete: (
    inspection: Inspection
  ) => void;
}


export function CameraCapture({
  panelId,
  onInspectionComplete,
}: CameraCaptureProps) {

  // ============================================================
  // STATE
  // ============================================================

  const [phase, setPhase] =
    useState<CapturePhase>('idle');

  const [error, setError] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<Inspection | null>(null);

  const [imageDataUrl, setImageDataUrl] =
    useState<string | null>(null);

  const [imageBlob, setImageBlob] =
    useState<Blob | null>(null);

  const [cameraActive, setCameraActive] =
    useState(false);

  const [cameraError, setCameraError] =
    useState<string | null>(null);

  const [facingMode, setFacingMode] =
    useState<'environment' | 'user'>(
      'environment'
    );

  const [autoCaptureEnabled, setAutoCaptureEnabled] =
    useState(false);

  const [captureStatus, setCaptureStatus] =
    useState('Camera is ready.');

  // ============================================================
  // REFS
  // ============================================================

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const autoCaptureTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const firstCaptureTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  /*
   * Prevent two AI inspections from running
   * simultaneously.
   */
  const processingRef =
    useRef(false);

  const modelConnected =
    isModelConnected();


  // ============================================================
  // STOP CAMERA
  // ============================================================

  const stopCamera = useCallback(() => {

    console.log('Stopping camera...');

    // Stop automatic timer
    if (autoCaptureTimerRef.current) {

      clearInterval(
        autoCaptureTimerRef.current
      );

      autoCaptureTimerRef.current = null;
    }

    // Stop first capture timer
    if (firstCaptureTimerRef.current) {

      clearTimeout(
        firstCaptureTimerRef.current
      );

      firstCaptureTimerRef.current = null;
    }

    // Stop camera stream
    if (streamRef.current) {

      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current = null;
    }

    // Remove stream from video
    if (videoRef.current) {

      videoRef.current.srcObject =
        null;
    }

    setCameraActive(false);

    setAutoCaptureEnabled(false);

    processingRef.current = false;

    setCaptureStatus(
      'Camera stopped.'
    );

  }, []);


  // ============================================================
  // START CAMERA
  // ============================================================

  const startCamera = useCallback(
    async () => {

      setCameraError(null);

      setError(null);

      setResult(null);

      setImageDataUrl(null);

      setImageBlob(null);

      setPhase('idle');

      setAutoCaptureEnabled(false);

      setCaptureStatus(
        'Connecting to DroidCam...'
      );


      try {

        // ------------------------------------------------------
        // Check browser support
        // ------------------------------------------------------

        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {

          throw new Error(
            'Camera API is not supported by this browser.'
          );
        }


        // ------------------------------------------------------
        // Stop previous stream if any
        // ------------------------------------------------------

        if (streamRef.current) {

          streamRef.current
            .getTracks()
            .forEach((track) => {
              track.stop();
            });

          streamRef.current = null;
        }


        console.log(
          'Requesting camera access...'
        );


        // ------------------------------------------------------
        // Request camera
        // ------------------------------------------------------

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
          'Camera stream received:',
          stream
        );


        // ------------------------------------------------------
        // Save stream
        // ------------------------------------------------------

        streamRef.current =
          stream;


        // ------------------------------------------------------
        // Camera active
        // ------------------------------------------------------

        setCameraActive(true);


        // ------------------------------------------------------
        // Attach stream to video
        //
        // IMPORTANT:
        // We attach it AFTER React has rendered
        // the <video> element.
        // ------------------------------------------------------

        setTimeout(() => {

          const video =
            videoRef.current;

          if (!video) {

            console.error(
              'Video element not found.'
            );

            setCameraError(
              'Video element could not be initialized.'
            );

            return;
          }


          console.log(
            'Attaching camera stream to video...'
          );


          video.srcObject =
            stream;


          video.onloadedmetadata =
            async () => {

              console.log(
                'Video metadata loaded.'
              );

              try {

                await video.play();

                console.log(
                  'Video is playing:',
                  video.videoWidth,
                  'x',
                  video.videoHeight
                );


                setCaptureStatus(
                  'DroidCam connected. Preparing automatic capture...'
                );


                /*
                 * Give camera 3 seconds to stabilize.
                 */
                firstCaptureTimerRef.current =
                  setTimeout(() => {

                    if (
                      streamRef.current &&
                      video.readyState >= 2
                    ) {

                      setAutoCaptureEnabled(
                        true
                      );

                      setCaptureStatus(
                        'Automatic capture is ON.'
                      );

                    }

                  }, 3000);

              } catch (playError) {

                console.error(
                  'Video play error:',
                  playError
                );

                setCameraError(
                  'Camera connected, but the video could not start.'
                );
              }
            };

        }, 100);


      } catch (err) {

        console.error(
          'Camera error:',
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

        setCameraActive(false);

      }

    },
    [facingMode]
  );


  // ============================================================
  // CAPTURE IMAGE FROM CAMERA
  // ============================================================

  const captureFromCamera =
    useCallback(async () => {

      const video =
        videoRef.current;


      if (!video) {

        console.log(
          'Video element does not exist.'
        );

        return;
      }


      if (!streamRef.current) {

        console.log(
          'No active camera stream.'
        );

        return;
      }


      /*
       * Don't start another inspection
       * while current one is processing.
       */

      if (processingRef.current) {

        console.log(
          'Inspection already running. Skipping capture.'
        );

        return;
      }


      /*
       * Video must contain real frames.
       */

      if (video.readyState < 2) {

        console.log(
          'Video is not ready.'
        );

        return;
      }


      if (
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {

        console.log(
          'Video has no dimensions.'
        );

        return;
      }


      console.log(
        'Capturing frame:',
        video.videoWidth,
        'x',
        video.videoHeight
      );


      processingRef.current =
        true;


      try {

        // ------------------------------------------------------
        // Create canvas
        // ------------------------------------------------------

        const canvas =
          document.createElement(
            'canvas'
          );


        canvas.width =
          video.videoWidth;

        canvas.height =
          video.videoHeight;


        const context =
          canvas.getContext('2d');


        if (!context) {

          processingRef.current =
            false;

          return;
        }


        // ------------------------------------------------------
        // Draw video frame
        // ------------------------------------------------------

        context.drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height
        );


        // ------------------------------------------------------
        // Convert to JPEG
        // ------------------------------------------------------

        canvas.toBlob(
          async (blob) => {

            if (!blob) {

              console.error(
                'Could not create image blob.'
              );

              processingRef.current =
                false;

              return;
            }


            console.log(
              'PHOTO CAPTURED SUCCESSFULLY'
            );


            // Save blob
            setImageBlob(blob);


            // Show captured image
            const dataUrl =
              canvas.toDataURL(
                'image/jpeg',
                0.85
              );

            setImageDataUrl(
              dataUrl
            );


            // --------------------------------------------------
            // Run EXISTING AI pipeline
            // --------------------------------------------------

            setPhase(
              'processing'
            );

            setCaptureStatus(
              'Photo captured. Running AI inspection...'
            );


            setError(null);


            try {

              await ensureNotificationPermission();


              /*
               * IMPORTANT:
               *
               * This is your existing backend
               * inspection function.
               *
               * MobileNetV3 + Grad-CAM remains
               * in your existing ML service.
               */

              const inspection =
                await runInspection(
                  panelId,
                  blob,
                  'manual'
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
              // Display result
              // ------------------------------------------------

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


            } catch (inspectionError) {

              console.error(
                'Inspection error:',
                inspectionError
              );


              setError(
                inspectionError instanceof Error
                  ? inspectionError.message
                  : 'Inspection failed unexpectedly.'
              );


              setPhase(
                'error'
              );


              setCaptureStatus(
                'Inspection failed.'
              );

            } finally {

              processingRef.current =
                false;
            }

          },
          'image/jpeg',
          0.85
        );


      } catch (captureError) {

        console.error(
          'Capture error:',
          captureError
        );

        processingRef.current =
          false;
      }

    }, [
      panelId,
      onInspectionComplete,
    ]);


  // ============================================================
  // AUTOMATIC CAPTURE
  // ============================================================

  useEffect(() => {

    if (
      !cameraActive ||
      !autoCaptureEnabled
    ) {

      return;
    }


    console.log(
      'Automatic capture started.'
    );


    /*
     * Capture immediately once camera
     * has stabilized.
     */

    const immediateTimer =
      setTimeout(() => {

        if (
          streamRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          !processingRef.current
        ) {

          console.log(
            'Taking automatic photo...'
          );

          captureFromCamera();
        }

      }, 1000);


    /*
     * Continue every 5 seconds.
     */

    autoCaptureTimerRef.current =
      setInterval(() => {

        if (
          streamRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          !processingRef.current
        ) {

          console.log(
            'Taking automatic photo...'
          );

          captureFromCamera();

        } else {

          console.log(
            'Skipping capture because camera is not ready or AI is processing.'
          );
        }

      }, 5000);


    /*
     * Cleanup timer.
     */

    return () => {

      clearTimeout(
        immediateTimer
      );


      if (
        autoCaptureTimerRef.current
      ) {

        clearInterval(
          autoCaptureTimerRef.current
        );

        autoCaptureTimerRef.current =
          null;
      }

    };

  }, [
    cameraActive,
    autoCaptureEnabled,
    captureFromCamera,
  ]);


  // ============================================================
  // CLEANUP WHEN COMPONENT UNMOUNTS
  // ============================================================

  useEffect(() => {

    return () => {

      stopCamera();

    };

  }, [stopCamera]);


  // ============================================================
  // FILE UPLOAD
  // ============================================================

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file =
      e.target.files?.[0];


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

      setError(null);
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


  // ============================================================
  // RESET
  // ============================================================

  const resetCapture = () => {

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

    setCaptureStatus(
      'Camera is ready.'
    );
  };


  // ============================================================
  // MANUAL INSPECTION FOR UPLOADED IMAGE
  // ============================================================

  const runInspectionPipeline =
    async () => {

      if (!imageBlob) {
        return;
      }


      setPhase(
        'processing'
      );

      setError(null);


      await ensureNotificationPermission();


      try {

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


        onInspectionComplete(
          inspection
        );


      } catch (err) {

        setError(
          err instanceof Error
            ? err.message
            : 'Inspection failed unexpectedly.'
        );

        setPhase(
          'error'
        );
      }
    };


  // ============================================================
  // UI
  // ============================================================

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

            {' '}The AI inference service URL is not configured.

            You can still capture and
            store images, but predictions
            will be marked as failed until

            <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded font-mono text-xs">
              VITE_MODEL_INFERENCE_URL
            </code>

            is set in the environment.

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
          CAMERA ERROR
          ====================================================== */}

      {cameraError && (

        <div className="mb-6 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">

          {cameraError}

        </div>
      )}


      {/* ======================================================
          CAMERA / IDLE
          ====================================================== */}

      {phase === 'idle' && (

        <div className="space-y-4 animate-fade-in">


          {/* CAMERA ACTIVE */}

          {cameraActive && (

            <div className="relative bg-ink-950 rounded-2xl overflow-hidden animate-scale-in">


              {/* VIDEO */}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-video object-cover"
              />


              {/* CAMERA BORDER */}

              <div className="absolute inset-0 pointer-events-none border-2 border-white/20 m-4 rounded-xl" />


              {/* STATUS */}

              <div className="absolute top-4 left-4">

                <div className="flex items-center gap-2 px-3 py-2 bg-black/70 backdrop-blur-sm rounded-lg text-white text-xs">

                  <span
                    className={`w-2 h-2 rounded-full ${
                      autoCaptureEnabled
                        ? 'bg-green-400 animate-pulse'
                        : 'bg-yellow-400'
                    }`}
                  />

                  {autoCaptureEnabled
                    ? 'Automatic capture ON'
                    : 'Connecting camera...'}

                </div>

              </div>


              {/* CAPTURE MESSAGE */}

              <div className="absolute bottom-20 left-1/2 -translate-x-1/2">

                <div className="px-4 py-2 bg-black/70 backdrop-blur-sm rounded-lg text-white text-xs whitespace-nowrap">

                  {captureStatus}

                </div>

              </div>


              {/* BUTTONS */}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">


                {/* MANUAL CAPTURE */}

                <button
                  onClick={
                    captureFromCamera
                  }
                  disabled={
                    processingRef.current
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-ink-900 text-sm font-medium rounded-xl hover:bg-ink-100 transition-colors disabled:opacity-50"
                >

                  <Camera
                    size={16}
                  />

                  Capture Now

                </button>


                {/* SWITCH CAMERA */}

                <button
                  onClick={() => {

                    stopCamera();

                    setFacingMode(
                      (mode) =>
                        mode ===
                        'environment'
                          ? 'user'
                          : 'environment'
                    );

                  }}
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


          {/* START CAMERA */}

          {!cameraActive && (

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


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

                  Start Automatic Inspection

                </span>


                <span className="text-xs text-ink-400">

                  DroidCam • automatic capture

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
                ref={fileInputRef}
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
          UPLOADED IMAGE PREVIEW
          ====================================================== */}

      {phase === 'preview' &&
        imageDataUrl && (

          <div className="space-y-5 animate-fade-in">


            <div className="bg-ink-950 rounded-2xl overflow-hidden">

              <img
                src={imageDataUrl}
                alt="Captured solar panel"
                className="w-full object-contain max-h-[450px]"
              />

            </div>


            <div className="flex items-center justify-between">

              <div className="text-sm text-ink-500">

                Panel:{' '}

                <span className="font-medium text-ink-700">

                  {panelId}

                </span>

              </div>


              <div className="flex gap-2.5">

                <button
                  onClick={
                    resetCapture
                  }
                  className="px-4 py-2.5 text-sm font-medium text-ink-600 border border-ink-200 rounded-xl hover:bg-ink-50 transition-colors"
                >

                  Retake

                </button>


                <button
                  onClick={
                    runInspectionPipeline
                  }
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 transition-all"
                >

                  <CheckCircle2
                    size={16}
                  />

                  Run Inspection

                </button>

              </div>

            </div>

          </div>
        )}


      {/* ======================================================
          PROCESSING
          ====================================================== */}

      {phase === 'processing' && (

        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">

          <div className="relative">

            <div className="w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center">

              <Loader2
                size={28}
                className="animate-spin text-ink-400"
              />

            </div>

          </div>


          <p className="mt-6 text-sm font-medium text-ink-700">

            Running AI inspection

          </p>


          <p className="mt-1.5 text-xs text-ink-400">

            GPS weather check, model analysis, and cleaning decision

          </p>

        </div>
      )}


      {/* ======================================================
          SUCCESS
          ====================================================== */}

      {phase === 'success' &&
        result && (

          <div className="space-y-5 animate-fade-in-up">


            <div className="flex items-center gap-2.5">

              {result.processing_status ===
              'completed' ? (

                <CheckCircle2
                  size={22}
                  className="text-green-600"
                />

              ) : (

                <AlertCircle
                  size={22}
                  className="text-red-600"
                />

              )}


              <h3 className="text-lg font-semibold text-ink-900">

                {result.processing_status ===
                'completed'
                  ? 'Inspection Complete'
                  : 'Inspection Failed'}

              </h3>

            </div>


            {/* ORIGINAL IMAGE */}

            {imageDataUrl && (

              <div className="space-y-3">

                <p className="text-xs font-medium text-ink-400">

                  Captured Image

                </p>


                <div className="bg-ink-950 rounded-2xl overflow-hidden">

                  <img
                    src={imageDataUrl}
                    alt="Inspected solar panel"
                    className="w-full object-contain max-h-[350px]"
                  />

                </div>

              </div>
            )}


            {/* RESULT */}

            <div className="grid grid-cols-2 gap-px bg-ink-200/60 rounded-2xl overflow-hidden border border-ink-200/60">


              <div className="bg-white p-5">

                <p className="text-xs text-ink-400 mb-1">

                  Panel

                </p>

                <p className="text-sm font-medium text-ink-800">

                  {result.panel_id}

                </p>

              </div>


              <div className="bg-white p-5">

                <p className="text-xs text-ink-400 mb-1.5">

                  Status

                </p>

                <FaultBadge
                  isFault={
                    result.is_fault
                  }
                />

              </div>


              <div className="bg-white p-5">

                <p className="text-xs text-ink-400 mb-1">

                  Prediction

                </p>

                <p className="text-sm font-medium text-ink-800">

                  {result.prediction ??
                    'N/A'}

                </p>

              </div>


              <div className="bg-white p-5">

                <p className="text-xs text-ink-400 mb-1.5">

                  Confidence

                </p>

                <ConfidenceBar
                  confidence={
                    result.confidence
                  }
                />

              </div>

            </div>


            {/* BACKEND ERROR */}

            {result.error_message && (

              <div className="px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">

                {result.error_message}

              </div>

            )}


            {/* WEATHER */}

            <InspectionContext
              result={result}
            />


            {/* GRAD-CAM */}

            <GradCamPanel
              result={result}
            />


            {/* NEW INSPECTION */}

            <button
              onClick={
                resetCapture
              }
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >

              <Camera
                size={16}
              />

              New Inspection

            </button>

          </div>
        )}


      {/* ======================================================
          ERROR
          ====================================================== */}

      {phase === 'error' && (

        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">

          <AlertCircle
            size={32}
            className="text-red-500"
          />


          <p className="mt-4 text-sm font-medium text-ink-700">

            Inspection failed

          </p>


          <button
            onClick={() =>
              setPhase(
                imageBlob
                  ? 'preview'
                  : 'idle'
              )
            }
            className="mt-5 px-4 py-2.5 text-sm font-medium text-ink-600 border border-ink-200 rounded-xl hover:bg-ink-50 transition-colors"
          >

            Try Again

          </button>

        </div>
      )}

    </div>
  );
}


// ============================================================
// GRAD-CAM PANEL
// ============================================================

function GradCamPanel({
  result,
}: {
  result: Inspection;
}) {

  const gradcamImage =
    result.raw_output
      ?.gradcam_image as
      | string
      | undefined;


  const gradcamError =
    result.raw_output
      ?.gradcam_error as
      | string
      | undefined;


  if (
    !gradcamImage &&
    !gradcamError
  ) {

    return (

      <div className="bg-white border border-amber-200 rounded-xl p-4">

        <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5">

          <ScanSearch
            size={13}
          />

          AI Explainability - Grad-CAM

        </p>


        <p className="text-sm text-amber-700">

          Grad-CAM heatmap was not returned by the AI service.

        </p>

      </div>
    );
  }


  return (

    <div className="space-y-3">

      <p className="text-xs font-medium text-ink-400 flex items-center gap-1.5">

        <ScanSearch
          size={13}
        />

        AI Explainability - Grad-CAM

      </p>


      {gradcamImage ? (

        <div className="bg-ink-950 rounded-2xl overflow-hidden">

          <img
            src={gradcamImage}
            alt="Grad-CAM heatmap for solar panel"
            className="w-full object-contain max-h-[350px]"
          />

        </div>

      ) : (

        <div className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">

          {gradcamError ??
            'Grad-CAM heatmap could not be generated for this image.'}

        </div>

      )}


      {gradcamImage &&
        gradcamError && (

          <p className="text-xs text-amber-700">

            {gradcamError}

          </p>

        )}

    </div>
  );
}


// ============================================================
// WEATHER + CLEANING DECISION
// ============================================================

function InspectionContext({
  result,
}: {
  result: Inspection;
}) {

  const weather =
    result.raw_output
      ?.weather as
      | WeatherSnapshot
      | undefined;


  const cleaningDecision =
    result.raw_output
      ?.cleaning_decision as
      | CleaningDecision
      | undefined;


  if (
    !weather &&
    !cleaningDecision
  ) {

    return null;
  }


  return (

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">


      {/* WEATHER */}

      {weather && (

        <div className="bg-white border border-ink-200/60 rounded-xl p-4">

          <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5">

            <CloudSun
              size={13}
            />

            Weather

          </p>


          {weather.error ? (

            <p className="text-sm text-amber-700">

              {weather.error}

            </p>

          ) : (

            <p className="text-sm text-ink-700">

              {formatWeatherValue(
                weather.temperature_c,
                'C'
              )}

              {' | rain '}

              {formatWeatherValue(
                weather.forecast_24h_precipitation_mm,
                'mm'
              )}

            </p>

          )}


          {!weather.error && (

            <p className="text-xs text-ink-400 mt-1">

              GPS{' '}

              {weather.latitude.toFixed(
                4
              )}

              ,{' '}

              {weather.longitude.toFixed(
                4
              )}

            </p>

          )}

        </div>
      )}


      {/* CLEANING DECISION */}

      {cleaningDecision && (

        <div className="bg-white border border-ink-200/60 rounded-xl p-4">

          <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5">

            <Droplets
              size={13}
            />

            Cleaning Decision

          </p>


          <p className="text-sm font-medium text-ink-800">

            {cleaningDecision.label}

          </p>


          <p className="text-xs text-ink-500 mt-1">

            {cleaningDecision.reason}

          </p>

        </div>
      )}

    </div>
  );
}


// ============================================================
// WEATHER FORMAT
// ============================================================

function formatWeatherValue(
  value:
    | number
    | null
    | undefined,
  unit: string
): string {

  return value == null
    ? 'N/A'
    : `${value}${unit}`;
}