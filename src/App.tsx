import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Sun,
  LayoutDashboard,
  Camera,
  History,
  Settings,
  Menu,
  X,
  LogOut,
  Info,
} from 'lucide-react';

import { Dashboard } from '@/components/Dashboard';
import { CameraCapture } from '@/components/CameraCapture';
import { InspectionHistory } from '@/components/InspectionHistory';
import { InspectionDetails } from '@/components/InspectionDetails';
import { ScheduleSettings } from '@/components/ScheduleSettings';
import { NotificationStatus } from '@/components/NotificationStatus';
import { AuthPage } from '@/components/AuthPage';

import { useAuth } from '@/lib/authContext';
import { isModelConnected } from '@/lib/modelAdapter';
import { getSchedule } from '@/lib/inspectionApi';


// ============================================================
// TYPES
// ============================================================

type View =
  | 'dashboard'
  | 'capture'
  | 'history'
  | 'details'
  | 'schedule'
  | 'about';


// ============================================================
// DEFAULT PANEL
// ============================================================

const DEFAULT_PANEL_ID = 'Panel-A1';


// ============================================================
// APP
// ============================================================

export default function App() {

  const {
    user,
    loading,
    signOut,
  } = useAuth();


  // ------------------------------------------------------------
  // CURRENT PAGE
  // ------------------------------------------------------------

  const [
    view,
    setView,
  ] = useState<View>('dashboard');


  // ------------------------------------------------------------
  // SELECTED INSPECTION
  // ------------------------------------------------------------

  const [
    selectedInspectionId,
    setSelectedInspectionId,
  ] = useState<string | null>(null);


  // ------------------------------------------------------------
  // REFRESH KEY
  // ------------------------------------------------------------

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);


  // ------------------------------------------------------------
  // MOBILE MENU
  // ------------------------------------------------------------

  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(false);


  // ------------------------------------------------------------
  // PANEL
  // ------------------------------------------------------------

  const [
    panelId,
  ] = useState(DEFAULT_PANEL_ID);


  // ------------------------------------------------------------
  // SCHEDULED CAPTURE
  //
  // false:
  // Camera can be opened normally.
  // No automatic capture.
  //
  // true:
  // Schedule has reached its configured time.
  // CameraCapture starts automatic capture.
  // ------------------------------------------------------------

  const [
    scheduledCapture,
    setScheduledCapture,
  ] = useState(false);


  // ------------------------------------------------------------
  // PREVENT MULTIPLE SCHEDULE CHECKS
  // ------------------------------------------------------------

  const scheduledInspectionRunning =
    useRef(false);


  // ------------------------------------------------------------
  // LAST SCHEDULE RUN
  //
  // Used so that the same schedule cannot
  // start repeatedly during the same day.
  // ------------------------------------------------------------

  const lastScheduledRun =
    useRef<string | null>(null);


  // ------------------------------------------------------------
  // MODEL STATUS
  // ------------------------------------------------------------

  const modelConnected =
    isModelConnected();


  // ============================================================
  // INSPECTION COMPLETE
  // ============================================================

  const handleInspectionComplete = () => {

    setRefreshKey(
      (key) => key + 1
    );

  };


  // ============================================================
  // SCHEDULE CHECKER
  // ============================================================

  useEffect(() => {

    if (!user) {
      return;
    }


    let cancelled = false;


    // ----------------------------------------------------------
    // CHECK SCHEDULE
    // ----------------------------------------------------------

    async function checkSchedule() {

      if (
        cancelled ||
        scheduledInspectionRunning.current
      ) {

        return;

      }


      try {

        // ------------------------------------------------------
        // GET CURRENT SCHEDULE
        // ------------------------------------------------------

        const schedule =
          await getSchedule(panelId);


        // ------------------------------------------------------
        // NO ACTIVE SCHEDULE
        // ------------------------------------------------------

        if (
          !schedule ||
          !schedule.is_active ||
          !schedule.days_of_week ||
          schedule.days_of_week.length === 0
        ) {

          return;

        }


        // ------------------------------------------------------
        // CURRENT DATE/TIME
        // ------------------------------------------------------

        const now =
          new Date();


        // ------------------------------------------------------
        // READ SCHEDULED TIME
        //
        // Database format:
        //
        // HH:MM
        //
        // Example:
        //
        // 19:30
        // ------------------------------------------------------

        const timeParts =
          schedule.inspection_time
            .split(':')
            .map(Number);


        const scheduledHour =
          timeParts[0];


        const scheduledMinute =
          timeParts[1];


        // ------------------------------------------------------
        // VALIDATE TIME
        // ------------------------------------------------------

        if (
          !Number.isInteger(
            scheduledHour
          ) ||
          !Number.isInteger(
            scheduledMinute
          ) ||
          scheduledHour < 0 ||
          scheduledHour > 23 ||
          scheduledMinute < 0 ||
          scheduledMinute > 59
        ) {

          console.warn(
            '[Schedule] Invalid inspection time:',
            schedule.inspection_time
          );

          return;

        }


        // ------------------------------------------------------
        // CURRENT DAY
        //
        // JavaScript:
        //
        // Sunday    = 0
        // Monday    = 1
        // Tuesday   = 2
        // Wednesday = 3
        // Thursday  = 4
        // Friday    = 5
        // Saturday  = 6
        // ------------------------------------------------------

        const today =
          now.getDay();


        // ------------------------------------------------------
        // CHECK SELECTED DAY
        // ------------------------------------------------------

        const isScheduledDay =
          schedule.days_of_week.includes(
            today
          );


        if (!isScheduledDay) {

          return;

        }


        // ------------------------------------------------------
        // CURRENT HOUR/MINUTE
        // ------------------------------------------------------

        const currentHour =
          now.getHours();


        const currentMinute =
          now.getMinutes();


        const currentSecond =
          now.getSeconds();


        // ------------------------------------------------------
        // DEBUG INFORMATION
        // ------------------------------------------------------

        console.log(
          '[Schedule]',
          {
            today,
            currentTime:
              `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`,
            scheduledTime:
              schedule.inspection_time,
            isScheduledDay,
          }
        );


        // ======================================================
        // IMPORTANT SCHEDULE CHECK
        // ======================================================
        //
        // We DO NOT use:
        //
        // currentTime >= scheduledTime
        //
        // because that would cause:
        //
        // 7:00 PM schedule
        // 8:00 PM current time
        //
        // to still be considered due.
        //
        // Instead, the hour and minute must match.
        //
        // Example:
        //
        // Schedule = 19:30
        //
        // 19:29 -> FALSE
        // 19:30 -> TRUE
        // 19:31 -> FALSE
        // 20:00 -> FALSE
        //
        // The seconds are intentionally not included.
        // This gives us the complete scheduled minute.
        // ======================================================

        const isCorrectHour =
          currentHour ===
          scheduledHour;


        const isCorrectMinute =
          currentMinute ===
          scheduledMinute;


        const isDue =
          isScheduledDay &&
          isCorrectHour &&
          isCorrectMinute;


        if (!isDue) {

          return;

        }


        // ------------------------------------------------------
        // UNIQUE DAILY RUN KEY
        // ------------------------------------------------------

        const runKey =
          `${schedule.id}-${now.toDateString()}-${schedule.inspection_time}`;


        // ------------------------------------------------------
        // PREVENT DUPLICATE RUN
        // ------------------------------------------------------

        if (
          lastScheduledRun.current ===
          runKey
        ) {

          console.log(
            '[Schedule] Already triggered today:',
            runKey
          );

          return;

        }


        // ------------------------------------------------------
        // LOCK SCHEDULE
        // ------------------------------------------------------

        scheduledInspectionRunning.current =
          true;


        // ------------------------------------------------------
        // MARK THIS SCHEDULE AS RUN
        // ------------------------------------------------------

        lastScheduledRun.current =
          runKey;


        // ------------------------------------------------------
        // LOG
        // ------------------------------------------------------

        console.log(
          '========================================'
        );

        console.log(
          'SCHEDULED INSPECTION STARTING'
        );

        console.log(
          'Panel:',
          schedule.panel_id
        );

        console.log(
          'Camera:',
          schedule.camera_device
        );

        console.log(
          'Scheduled time:',
          schedule.inspection_time
        );

        console.log(
          'Actual time:',
          now.toLocaleTimeString()
        );

        console.log(
          '========================================'
        );


        // ------------------------------------------------------
        // GO TO CAMERA PAGE
        // ------------------------------------------------------

        setView(
          'capture'
        );


        // ------------------------------------------------------
        // START SCHEDULED CAPTURE
        //
        // IMPORTANT:
        //
        // App.tsx does NOT capture the image itself.
        //
        // It only tells CameraCapture:
        //
        // "The scheduled time has arrived."
        //
        // CameraCapture.tsx is responsible for:
        //
        // Camera
        // ↓
        // Capture
        // ↓
        // AI inspection
        // ↓
        // Wait 5 seconds
        // ↓
        // Capture
        // ↓
        // ...
        // ------------------------------------------------------

        setScheduledCapture(
          true
        );


      } catch (error) {

        console.error(
          '[Schedule] Schedule check failed:',
          error
        );

      } finally {

        scheduledInspectionRunning.current =
          false;

      }

    }


    // ==========================================================
    // CHECK IMMEDIATELY
    // ==========================================================

    checkSchedule();


    // ==========================================================
    // CHECK EVERY 5 SECONDS
    // ==========================================================

    const timer =
      window.setInterval(
        checkSchedule,
        5_000
      );


    // ==========================================================
    // CLEANUP
    // ==========================================================

    return () => {

      cancelled = true;

      window.clearInterval(
        timer
      );

    };

  }, [
    panelId,
    user,
  ]);


  // ============================================================
  // SELECT INSPECTION
  // ============================================================

  const handleSelectInspection = (
    id: string
  ) => {

    setSelectedInspectionId(
      id
    );

    setView(
      'details'
    );

    setMobileNavOpen(
      false
    );

  };


  // ============================================================
  // NAVIGATION
  // ============================================================

  const navigate = (
    nextView: View
  ) => {

    /*
     * If the user manually leaves
     * the camera page, stop the
     * scheduled capture signal.
     */

    if (
      nextView !== 'capture'
    ) {

      setScheduledCapture(
        false
      );

    }


    setView(
      nextView
    );

    setMobileNavOpen(
      false
    );

  };


  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {

    return (

      <div className="min-h-screen bg-ink-50 flex items-center justify-center">

        <Sun
          size={24}
          className="text-ink-300 animate-pulse"
        />

      </div>

    );

  }


  // ============================================================
  // AUTHENTICATION
  // ============================================================

  if (!user) {

    return <AuthPage />;

  }


  // ============================================================
  // NAVIGATION ITEMS
  // ============================================================

  const navItems = [

    {
      id: 'dashboard' as View,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },

    {
      id: 'capture' as View,
      label: 'New Inspection',
      icon: Camera,
    },

    {
      id: 'history' as View,
      label: 'History',
      icon: History,
    },

    {
      id: 'schedule' as View,
      label: 'Schedule',
      icon: Settings,
    },

    {
      id: 'about' as View,
      label: 'About',
      icon: Info,
    },

  ];


  // ============================================================
  // APPLICATION UI
  // ============================================================

  return (

    <div className="min-h-screen bg-ink-50 text-ink-900">


      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="bg-white/80 backdrop-blur-lg border-b border-ink-200/60 sticky top-0 z-30">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex items-center justify-between h-16">


            {/* LOGO */}

            <button
              onClick={() =>
                navigate('dashboard')
              }
              className="flex items-center gap-2.5 group"
            >

              <div className="w-9 h-9 bg-ink-900 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105">

                <Sun
                  size={18}
                  className="text-amber-400"
                />

              </div>


              <div className="hidden sm:block">

                <h1 className="text-sm font-semibold tracking-tight leading-none">

                  SolarGuard

                </h1>


                <p className="text-[11px] text-ink-400 leading-none mt-0.5">

                  Fault Detection System

                </p>

              </div>

            </button>


            {/* DESKTOP NAV */}

            <nav className="hidden md:flex items-center gap-1">

              {navItems.map(
                (item) => {

                  const Icon =
                    item.icon;


                  const active =
                    view === item.id ||
                    (
                      item.id === 'history' &&
                      view === 'details'
                    );


                  return (

                    <button
                      key={item.id}
                      onClick={() =>
                        navigate(
                          item.id
                        )
                      }
                      className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${
                        active
                          ? 'bg-ink-900 text-white'
                          : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'
                      }`}
                    >

                      <Icon
                        size={15}
                      />

                      {item.label}

                    </button>

                  );

                }
              )}

            </nav>


            {/* RIGHT SIDE */}

            <div className="flex items-center gap-3">

              <div className="hidden lg:flex items-center gap-2 text-xs text-ink-400">

                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />

                <span>
                  {user.email}
                </span>

              </div>


              <button
                onClick={
                  signOut
                }
                className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-400 hover:text-ink-900 rounded-lg transition-colors"
              >

                <LogOut
                  size={15}
                />

                <span className="hidden lg:inline">

                  Sign Out

                </span>

              </button>


              {/* MOBILE MENU */}

              <button
                onClick={() =>
                  setMobileNavOpen(
                    !mobileNavOpen
                  )
                }
                className="md:hidden p-2 text-ink-600"
              >

                {mobileNavOpen ? (

                  <X
                    size={20}
                  />

                ) : (

                  <Menu
                    size={20}
                  />

                )}

              </button>

            </div>

          </div>


          {/* ==================================================
              MOBILE NAV
              ================================================== */}

          {mobileNavOpen && (

            <nav className="md:hidden pb-3 space-y-1 animate-fade-in">

              {navItems.map(
                (item) => {

                  const Icon =
                    item.icon;


                  const active =
                    view === item.id ||
                    (
                      item.id === 'history' &&
                      view === 'details'
                    );


                  return (

                    <button
                      key={item.id}
                      onClick={() =>
                        navigate(
                          item.id
                        )
                      }
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg ${
                        active
                          ? 'bg-ink-900 text-white'
                          : 'text-ink-600 hover:bg-ink-100'
                      }`}
                    >

                      <Icon
                        size={16}
                      />

                      {item.label}

                    </button>

                  );

                }
              )}


              <button
                onClick={
                  signOut
                }
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-100 rounded-lg"
              >

                <LogOut
                  size={16}
                />

                Sign Out

              </button>

            </nav>

          )}

        </div>

      </header>


      {/* ======================================================
          MODEL STATUS
          ====================================================== */}

      {!modelConnected &&
        view !== 'about' && (

          <div className="bg-amber-50/80 backdrop-blur border-b border-amber-200/60 px-4 py-2.5">

            <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-amber-800">

              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />

              <span>

                AI model not connected.
                Set{' '}

                <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono">

                  VITE_MODEL_INFERENCE_URL

                </code>

                {' '}

                to enable predictions.

              </span>

            </div>

          </div>

        )}


      {/* ======================================================
          SCHEDULE STATUS
          ====================================================== */}

      {scheduledCapture && (

        <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">

          <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-green-800">

            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />

            <span className="font-medium">

              Scheduled inspection is active.
              Camera will capture an image every 5 seconds.

            </span>

          </div>

        </div>

      )}


      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div
          key={view}
          className="animate-fade-in"
        >


          {/* ==================================================
              DASHBOARD
              ================================================== */}

          {view === 'dashboard' && (

            <div className="space-y-8">

              <PageHeader
                title="Dashboard"
                subtitle="Real-time overview of your solar panel monitoring system."
              />

              <NotificationStatus />

              <Dashboard
                panelId={
                  panelId
                }
                onSelectInspection={
                  handleSelectInspection
                }
                refreshKey={
                  refreshKey
                }
              />

            </div>

          )}


          {/* ==================================================
              CAMERA
              ================================================== */}

          {view === 'capture' && (

            <div className="space-y-8">

              <PageHeader
                title="New Inspection"
                subtitle={
                  scheduledCapture
                    ? 'Scheduled inspection is active. The phone camera will capture an image every 5 seconds.'
                    : 'Capture an image of the solar panel using the phone camera through DroidCam, or upload an image file.'
                }
              />


              <CameraCapture

                panelId={
                  panelId
                }

                scheduledCapture={
                  scheduledCapture
                }

                onInspectionComplete={
                  handleInspectionComplete
                }

              />

            </div>

          )}


          {/* ==================================================
              HISTORY
              ================================================== */}

          {view === 'history' && (

            <div className="space-y-8">

              <PageHeader
                title="Inspection History"
                subtitle="Complete record of all past inspections with AI predictions and fault analysis."
              />


              <InspectionHistory
                panelId={
                  panelId
                }
                onSelectInspection={
                  handleSelectInspection
                }
                refreshKey={
                  refreshKey
                }
              />

            </div>

          )}


          {/* ==================================================
              DETAILS
              ================================================== */}

          {view === 'details' &&
            selectedInspectionId && (

              <InspectionDetails
                inspectionId={
                  selectedInspectionId
                }
                onBack={() =>
                  navigate(
                    'history'
                  )
                }
              />

            )}


          {/* ==================================================
              SCHEDULE
              ================================================== */}

          {view === 'schedule' && (

            <div className="space-y-8">

              <PageHeader
                title="Inspection Schedule"
                subtitle="Configure when automatic inspections run and which camera to use."
              />


              <ScheduleSettings
                panelId={
                  panelId
                }
              />


              <NotificationStatus />

            </div>

          )}


          {/* ==================================================
              ABOUT
              ================================================== */}

          {view === 'about' && (

            <AboutPage />

          )}

        </div>

      </main>


      {/* ======================================================
          FOOTER
          ====================================================== */}

      <footer className="border-t border-ink-200/60 mt-16">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">

            <div className="flex items-center gap-2 text-xs text-ink-400">

              <Sun
                size={12}
                className="text-amber-400"
              />

              <span>

                SolarGuard — AI-Based Fault Detection System for Solar Panels

              </span>

            </div>


            <p className="text-xs text-ink-400">

              Final Year Project

            </p>

          </div>

        </div>

      </footer>

    </div>

  );

}


// ============================================================
// PAGE HEADER
// ============================================================

function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {

  return (

    <div className="animate-fade-in-up">

      <h2 className="text-2xl font-semibold tracking-tight text-ink-900">

        {title}

      </h2>


      <p className="mt-1.5 text-sm text-ink-500">

        {subtitle}

      </p>

    </div>

  );

}


// ============================================================
// ABOUT PAGE
// ============================================================

function AboutPage() {

  return (

    <div className="max-w-3xl mx-auto space-y-10">

      <PageHeader
        title="About This Project"
        subtitle="Overview of the system, its purpose, and how it works."
      />


      <div className="space-y-6">


        {/* ==================================================
            PROBLEM
            ================================================== */}

        <section className="animate-fade-in-up">

          <h3 className="text-base font-semibold text-ink-900 mb-2">

            Problem Statement

          </h3>


          <p className="text-sm leading-relaxed text-ink-600">

            Solar panels are exposed to environmental
            conditions that can cause physical degradation
            over time. Faults such as microcracks, hotspots,
            dust accumulation, and broken cells reduce
            energy output and can lead to permanent damage
            if left unaddressed. Manual inspection of solar
            installations is slow, costly, and difficult to
            perform regularly, especially for large-scale or
            elevated installations.

          </p>

        </section>


        {/* ==================================================
            HOW IT WORKS
            ================================================== */}

        <section>

          <h3 className="text-base font-semibold text-ink-900 mb-3">

            How It Works

          </h3>


          <ol className="space-y-2.5">

            {[
              'The phone camera is connected to the computer using DroidCam.',
              'The SolarGuard application receives the camera stream through the browser.',
              'The application waits for the configured inspection schedule.',
              'At the scheduled time, automatic capture is enabled.',
              'The captured image is sent to the AI inference service.',
              'The MobileNetV3 model analyzes the solar panel image.',
              'The prediction and confidence score are returned.',
              'The inspection result is stored and displayed in the dashboard and history.',
              'If a fault is detected, a notification can be generated.',
            ].map(
              (
                step,
                index
              ) => (

                <li
                  key={index}
                  className="flex items-start gap-3 text-sm text-ink-600"
                >

                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink-900 text-white text-xs font-medium flex items-center justify-center">

                    {index + 1}

                  </span>


                  <span className="pt-0.5">

                    {step}

                  </span>

                </li>

              )
            )}

          </ol>

        </section>


        {/* ==================================================
            ARCHITECTURE
            ================================================== */}

        <section>

          <h3 className="text-base font-semibold text-ink-900 mb-2">

            Architecture

          </h3>


          <div className="bg-ink-950 rounded-xl p-5 font-mono text-xs text-ink-300 overflow-x-auto">

            Phone Camera → DroidCam → Browser → React Frontend → Inspection API → MobileNetV3 ML Service → Prediction → Database → Dashboard / Notification

          </div>

        </section>


        {/* ==================================================
            SCHEDULE
            ================================================== */}

        <section>

          <h3 className="text-base font-semibold text-ink-900 mb-2">

            Scheduled Inspection

          </h3>


          <p className="text-sm leading-relaxed text-ink-600">

            The scheduling module checks the configured
            inspection time every few seconds. When the
            selected day and exact scheduled hour and minute
            are reached, the application activates scheduled
            capture. The camera can remain connected and
            images are captured every five seconds through
            the CameraCapture component.

          </p>

        </section>


        {/* ==================================================
            MODEL
            ================================================== */}

        <section>

          <h3 className="text-base font-semibold text-ink-900 mb-2">

            Model Integration

          </h3>


          <p className="text-sm leading-relaxed text-ink-600">

            The frontend communicates with the existing
            inspection and model services. The current
            project uses MobileNetV3 Small as the lightweight
            image classification model.

          </p>

        </section>


        {/* ==================================================
            FEATURES
            ================================================== */}

        <section>

          <h3 className="text-base font-semibold text-ink-900 mb-3">

            Key Features

          </h3>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {[
              'DroidCam phone camera integration',
              'Live camera preview',
              'Manual image capture',
              'Scheduled automatic inspection',
              '5-second automatic capture interval',
              'AI-powered fault detection',
              'MobileNetV3 Small model',
              'Inspection history',
              'Dashboard statistics',
              'Weather information',
              'GPS information',
              'Cleaning recommendation',
              'Grad-CAM explainability',
              'Fault notifications',
              'Image upload fallback',
            ].map(
              (
                feature
              ) => (

                <div
                  key={feature}
                  className="flex items-center gap-2.5 text-sm text-ink-600"
                >

                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />

                  {feature}

                </div>

              )
            )}

          </div>

        </section>

      </div>

    </div>

  );

}