import React, { useState, useEffect, useRef } from "react";
import {
  Heart,
  Sparkles,
  Smile,
  PenTool,
  Activity,
  CheckCircle,
  MessageCircle,
  RotateCcw,
  Coffee,
  BookOpen,
  Volume2,
  Send,
  HeartHandshake,
  Quote,
  ArrowRight,
  Bot,
  User,
  ShieldAlert,
  Loader2,
  Plus,
  History,
  Trash2,
  Menu,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LogIn,
  Calendar,
  Sparkle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import { auth, signInWithGoogle, logout } from "./firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

// --- TYPES & CONSTANTS ---
interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

const STARTER_PROMPTS = [
  {
    icon: "🏫",
    text: "오늘 학부모님으로부터 다소 무리한 민원 연락을 받아서 가슴이 쿵쾅거려요.",
    label: "학부모 민원"
  },
  {
    icon: "📋",
    text: "수업 준비보다 행정 잡무와 보고서 작성이 너무 많아서 온몸의 진이 다 빠져요.",
    label: "행정 과부하"
  },
  {
    icon: "🧒",
    text: "말을 안 듣고 반항하거나 산만한 아이를 지도하는 과정에서 자괴감이 밀려옵니다.",
    label: "학생 생활지도"
  },
  {
    icon: "💔",
    text: "교사로서의 소명감이 갈수록 옅어지고, 매일 아침 출근하는 발걸음이 너무 무겁습니다.",
    label: "번아웃 & 회의감"
  }
];

const VENT_CATEGORIES = [
  { id: "민원", label: "🏫 학부모 민원", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "업무", label: "📋 행정 업무 과부하", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "지도", label: "🧒 학생 생활 지도", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "인간관계", label: "💔 동료/관리자 갈등", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "기타", label: "🍂 기타 고충 & 피로", color: "bg-zinc-50 text-zinc-700 border-zinc-200" }
];

const DIAGNOSIS_QUESTIONS = [
  {
    id: "q1",
    text: "퇴근 후나 주말에도 학교 일이나 걱정이 마음속에서 쉽게 지워지지 않는다.",
    category: "exhaustion"
  },
  {
    id: "q2",
    text: "학부모의 민원 전화나 문자, 상담 요청 소리만 들려도 가슴이 두근거리고 두렵다.",
    category: "relations"
  },
  {
    id: "q3",
    text: "과도한 행정 공문이나 부가적 잡무 때문에 원래 핵심인 수업 준비를 방해받는다.",
    category: "admin"
  },
  {
    id: "q4",
    text: "최근 들어 내가 정말 좋은 교사인지, 내 지도가 의미가 있는지 강한 자괴감이 든다.",
    category: "exhaustion"
  },
  {
    id: "q5",
    text: "아침에 눈을 뜨고 학교로 향할 때 숨이 턱 막히거나 몸에 힘이 전혀 들어가지 않는다.",
    category: "admin"
  }
];

export default function App() {
  // --- AUTH STATES ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- TAB NAVIGATION STATE ---
  const [activeTab, setActiveTab] = useState<"vent" | "diagnose" | "breath" | "analysis">("vent");
  
  // --- SESSIONS SIDEBAR STATE ---
  const [showSessionsSidebar, setShowSessionsSidebar] = useState(true);

  // --- HISTORICAL DATA LISTS (FROM FIRESTORE VIA BACKEND) ---
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [prescriptionsList, setPrescriptionsList] = useState<any[]>([]);
  const [diagnosesList, setDiagnosesList] = useState<any[]>([]);

  // --- ACTIVE SESSION STATE ---
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // --- STRESS ANALYSIS STATES ---
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [customCounselAdvice, setCustomCounselAdvice] = useState<string>("");

  const fetchStressAnalysis = async (forceRefetch = false) => {
    if (!user) return;
    
    // Attempt loading from local storage first
    const savedAdvice = localStorage.getItem(`counsel_advice_${user.uid}`);
    const savedResult = localStorage.getItem(`analysis_result_${user.uid}`);
    
    if (savedAdvice) {
      setCustomCounselAdvice(savedAdvice);
    }
    if (savedResult && !forceRefetch) {
      try {
        setAnalysisResult(JSON.parse(savedResult));
        return;
      } catch (e) {
        console.error("Failed to parse cached analysis", e);
      }
    }
    
    setIsAnalysisLoading(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/analysis/stress?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data);
        if (!data.empty) {
          localStorage.setItem(`analysis_result_${user.uid}`, JSON.stringify(data));
          if (data.customCounselAdvice) {
            setCustomCounselAdvice(data.customCounselAdvice);
            localStorage.setItem(`counsel_advice_${user.uid}`, data.customCounselAdvice);
          }
        }
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || "분석 리포트를 불러오는 도중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      console.error("fetchStressAnalysis error:", err);
      setApiError(err.message || "스트레스 분석 중 요류가 발생했습니다.");
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  // 1. AI Chat States
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "model",
      text: "안녕하세요, 선생님. 이 공간은 오직 선생님만을 위한 따뜻한 대나무숲이자 안전지대입니다. \n\n학급 운영, 학부모 민원, 과도한 잡무 혹은 말 못할 정서적 힘겨움 등 어떤 이야기든 괜찮습니다. 제가 귀 기울여 듣고 온기를 나누어 드릴게요. 편안하게 말씀해 주세요.",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 2. Venting states
  const [ventText, setVentText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("민원");
  const [isVentingLoading, setIsVentingLoading] = useState(false);
  const [ventPrescription, setVentPrescription] = useState<{
    letterTitle: string;
    letterBody: string;
    prescription: string[];
    healingQuote: string;
  } | null>(null);
  const [isEnvelopeOpen, setIsEnvelopeOpen] = useState(false);

  // 3. Diagnosis states
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, number>>({});
  const [isDiagnosingLoading, setIsDiagnosingLoading] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<{
    statusTitle: string;
    overallAnalysis: string;
    exhaustionFeedback: string;
    relationsFeedback: string;
    adminFeedback: string;
    copingStrategy: string;
    scores?: { exhaustion: number; relations: number; admin: number };
  } | null>(null);

  // 4. Breathing states
  const [breathCycle, setBreathCycle] = useState<"inhale" | "hold" | "exhale" | "idle">("idle");
  const [breathTimer, setBreathTimer] = useState(4);
  const [breathCount, setBreathCount] = useState(0);

  // 5. Global notification / Error states
  const [apiError, setApiError] = useState<string | null>(null);

  // --- AUTH STATUS LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- FETCH HISTORICAL LISTS ---
  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchPrescriptions();
      fetchDiagnoses();
      fetchStressAnalysis();
    } else {
      setSessionsList([]);
      setPrescriptionsList([]);
      setDiagnosesList([]);
      setActiveSessionId(null);
      setAnalysisResult(null);
      setCustomCounselAdvice("");
    }
  }, [user]);

  const fetchSessions = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/history/sessions?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setSessionsList(data.sessions || []);
      }
    } catch (err) {
      console.error("Error loading sessions:", err);
    }
  };

  const fetchPrescriptions = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/history/prescriptions?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setPrescriptionsList(data.prescriptions || []);
      }
    } catch (err) {
      console.error("Error loading prescriptions:", err);
    }
  };

  const fetchDiagnoses = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/history/diagnoses?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setDiagnosesList(data.diagnoses || []);
      }
    } catch (err) {
      console.error("Error loading diagnoses:", err);
    }
  };

  // --- EFFECT FOR CHAT SCROLL ---
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // --- EFFECT FOR MINDFUL BREATHING TIMER ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (breathCycle !== "idle") {
      interval = setInterval(() => {
        setBreathTimer((prev) => {
          if (prev <= 1) {
            // Transition state
            if (breathCycle === "inhale") {
              setBreathCycle("hold");
              return 4; // 4s hold
            } else if (breathCycle === "hold") {
              setBreathCycle("exhale");
              return 4; // 4s exhale
            } else {
              setBreathCycle("inhale");
              setBreathCount((c) => c + 1);
              return 4; // 4s inhale
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [breathCycle]);

  // --- LOGIN & LOGOUT ---
  const handleGoogleLogin = async () => {
    try {
      setApiError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setApiError("구글 로그인 도중 문제가 발생했습니다. 브라우저 설정을 확인해 보세요.");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      handleResetChat();
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  // --- CHAT ACTIONS ---
  const handleSendChat = async (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim() || isChatLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date()
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue("");
    setIsChatLoading(true);
    setApiError(null);

    try {
      let currentSessionId = activeSessionId;

      // Persist Session creation on Firestore backend
      if (user) {
        if (!currentSessionId) {
          const sessionTitle = text.length > 20 ? text.slice(0, 20) + "..." : text;
          const sessionRes = await fetch("/api/history/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              title: sessionTitle
            })
          });
          if (sessionRes.ok) {
            const sData = await sessionRes.json();
            currentSessionId = sData.id;
            setActiveSessionId(currentSessionId);
            fetchSessions();
          }
        }

        // Save individual message record
        if (currentSessionId) {
          await fetch(`/api/history/sessions/${currentSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              role: "user",
              text
            })
          });
        }
      }

      // Map messages into history payload excluding the static welcome greeting
      const historyPayload = [...chatMessages.filter(m => m.id !== "welcome"), userMsg].map((m) => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: historyPayload,
          customCounselAdvice: customCounselAdvice || (user ? localStorage.getItem(`counsel_advice_${user.uid}`) : "") || ""
        })
      });

      if (!res.ok) {
        throw new Error("상담 서버와 연결할 수 없습니다. API 키 설정을 확인해 보세요.");
      }

      const data = await res.json();
      const botReply = data.reply;

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: botReply,
        timestamp: new Date()
      };

      setChatMessages((prev) => [...prev, botMsg]);

      // Save Model reply to subcollection
      if (user && currentSessionId) {
        await fetch(`/api/history/sessions/${currentSessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.uid,
            role: "model",
            text: botReply
          })
        });
        fetchSessions(); // Refresh metadata sorting
      }

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "상담 중 오류가 발생했습니다.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (!user) return;
    setIsChatLoading(true);
    setApiError(null);
    setActiveSessionId(sessionId);
    
    try {
      const res = await fetch(`/api/history/sessions/${sessionId}/messages?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          const mapped = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            timestamp: new Date(m.createdAt)
          }));
          setChatMessages(mapped);
        } else {
          setChatMessages([
            {
              id: "welcome",
              role: "model",
              text: "선택한 대화 내용이 존재하지 않습니다.",
              timestamp: new Date()
            }
          ]);
        }
      }
    } catch (err: any) {
      setApiError("대화를 불러오는데 실패했습니다.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm("이 상담 기록을 영구히 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/history/sessions/${sessionId}?userId=${user.uid}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (activeSessionId === sessionId) {
          handleResetChat();
        }
        fetchSessions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetChat = () => {
    setActiveSessionId(null);
    setChatMessages([
      {
        id: "welcome",
        role: "model",
        text: "안녕하세요, 선생님. 이 공간은 오직 선생님만을 위한 따뜻한 대나무숲이자 안전지대입니다. \n\n학급 운영, 학부모 민원, 과도한 잡무 혹은 말 못할 정서적 힘겨움 등 어떤 이야기든 괜찮습니다. 제가 귀 기울여 듣고 온기를 나누어 드릴게요. 편안하게 말씀해 주세요.",
        timestamp: new Date()
      }
    ]);
  };

  // --- VENTING ACTIONS ---
  const handleSubmitVent = async () => {
    if (!ventText.trim() || isVentingLoading) return;

    setIsVentingLoading(true);
    setVentPrescription(null);
    setIsEnvelopeOpen(false);
    setApiError(null);

    try {
      const res = await fetch("/api/vent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventContent: ventText,
          category: selectedCategory
        })
      });

      if (!res.ok) {
        throw new Error("처방전을 조제하지 못했습니다. 서버 상태를 확인해 주세요.");
      }

      const data = await res.json();
      setVentPrescription(data);

      // Persist to Cloud DB if logged in
      if (user) {
        try {
          await fetch("/api/history/prescriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              ventContent: ventText,
              category: selectedCategory,
              letterTitle: data.letterTitle,
              letterBody: data.letterBody,
              prescription: data.prescription,
              healingQuote: data.healingQuote
            })
          });
          fetchPrescriptions();
        } catch (saveErr) {
          console.error("Error saving prescription:", saveErr);
        }
      }

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "마음 편지 처방 도중 오류가 발생했습니다.");
    } finally {
      setIsVentingLoading(false);
    }
  };

  const handleSelectPrescription = (rx: any) => {
    setVentText(rx.ventContent);
    setSelectedCategory(rx.category);
    setVentPrescription({
      letterTitle: rx.letterTitle,
      letterBody: rx.letterBody,
      prescription: rx.prescription,
      healingQuote: rx.healingQuote
    });
    setIsEnvelopeOpen(true);
  };

  const handleDeletePrescription = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm("이 처방 편지 기록을 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/history/prescriptions/${id}?userId=${user.uid}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchPrescriptions();
        setVentPrescription(null);
        setVentText("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEnvelope = () => {
    setIsEnvelopeOpen(true);
  };

  const handleResetVent = () => {
    setVentText("");
    setVentPrescription(null);
    setIsEnvelopeOpen(false);
  };

  // --- DIAGNOSIS ACTIONS ---
  const handleAnswerDiagnosis = (score: number) => {
    const currentQ = DIAGNOSIS_QUESTIONS[currentQuestionIndex];
    setDiagnosticAnswers((prev) => ({
      ...prev,
      [currentQ.id]: score
    }));

    if (currentQuestionIndex < DIAGNOSIS_QUESTIONS.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      handleCalculateAndSubmitDiagnosis({
        ...diagnosticAnswers,
        [currentQ.id]: score
      });
    }
  };

  const handleCalculateAndSubmitDiagnosis = async (answers: Record<string, number>) => {
    setIsDiagnosingLoading(true);
    setApiError(null);

    const getScore = (ids: string[]) => {
      const sum = ids.reduce((acc, id) => acc + (answers[id] || 0), 0);
      const maxPossible = ids.length * 4;
      return Math.round((sum / maxPossible) * 10);
    };

    const scores = {
      exhaustion: getScore(["q1", "q4"]),
      relations: getScore(["q2"]),
      admin: getScore(["q3", "q5"])
    };

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores, answers })
      });

      if (!res.ok) {
        throw new Error("분석 결과를 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }

      const data = await res.json();
      const finalResult = {
        ...data,
        scores
      };
      setDiagnosisResult(finalResult);

      // Save to Cloud DB if logged in
      if (user) {
        try {
          await fetch("/api/history/diagnoses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              scores: scores,
              statusTitle: data.statusTitle,
              overallAnalysis: data.overallAnalysis,
              exhaustionFeedback: data.exhaustionFeedback,
              relationsFeedback: data.relationsFeedback,
              adminFeedback: data.adminFeedback,
              copingStrategy: data.copingStrategy
            })
          });
          fetchDiagnoses();
        } catch (saveErr) {
          console.error("Error saving diagnosis:", saveErr);
        }
      }

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "자가 진단 도중 문제가 발생했습니다.");
    } finally {
      setIsDiagnosingLoading(false);
    }
  };

  const handleSelectDiagnosis = (diag: any) => {
    setDiagnosisResult({
      statusTitle: diag.statusTitle,
      overallAnalysis: diag.overallAnalysis,
      exhaustionFeedback: diag.exhaustionFeedback,
      relationsFeedback: diag.relationsFeedback,
      adminFeedback: diag.adminFeedback,
      copingStrategy: diag.copingStrategy,
      scores: diag.scores
    });
  };

  const handleDeleteDiagnosis = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm("이 마음 진단 기록을 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/history/diagnoses/${id}?userId=${user.uid}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchDiagnoses();
        setDiagnosisResult(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetDiagnosis = () => {
    setCurrentQuestionIndex(0);
    setDiagnosticAnswers({});
    setDiagnosisResult(null);
  };

  const startBreathing = () => {
    setBreathCycle("inhale");
    setBreathTimer(4);
    setBreathCount(0);
  };

  const stopBreathing = () => {
    setBreathCycle("idle");
    setBreathTimer(4);
  };

  // Format Recharts chronology oldest -> newest
  const chartData = [...diagnosesList]
    .reverse()
    .map((d: any) => {
      const date = new Date(d.createdAt);
      return {
        dateStr: `${date.getMonth() + 1}/${date.getDate()}`,
        "정서적 탈진": d.scores?.exhaustion || 0,
        "대인관계 스트레스": d.scores?.relations || 0,
        "업무 과부하": d.scores?.admin || 0
      };
    });

  return (
    <div className="min-h-screen bg-[#faf8f5] text-zinc-800 font-sans antialiased transition-colors duration-300">
      
      {/* --- TOP HEADER BANNER --- */}
      <header id="app-header" className="sticky top-0 z-50 backdrop-blur-md bg-[#faf8f5]/85 border-b border-zinc-200/60 transition-all">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 rounded-2xl border border-emerald-100/80 shadow-inner">
              <HeartHandshake className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full tracking-wider">교사 전용 안전지대</span>
                <span className="text-[10px] text-zinc-400 font-mono">2026 심리 지원 프로젝트</span>
              </div>
              <h1 className="text-xl font-bold text-zinc-950 tracking-tight">교사 마음 쉼터 <span className="font-light text-zinc-500 font-serif text-sm">Teacher Mind Sanctuary</span></h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            ) : user ? (
              <div className="flex items-center space-x-3 bg-zinc-100/80 pl-2.5 pr-3.5 py-1.5 rounded-full border border-zinc-200/50">
                {user.photoURL ? (
                  <img src={user.photoURL} referrerPolicy="no-referrer" alt={user.displayName || "User"} className="w-6 h-6 rounded-full border border-white" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-bold">
                    {user.displayName?.charAt(0) || "T"}
                  </div>
                )}
                <span className="text-xs font-semibold text-zinc-700">{user.displayName || "선생님"}</span>
                <button 
                  onClick={handleLogout} 
                  className="p-1 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-200/50 transition"
                  title="로그아웃"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="flex items-center space-x-1.5 bg-emerald-900 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-full text-xs font-bold transition shadow-2xs hover:shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>상담 데이터 클라우드 연동 (로그인)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN DASHBOARD BODY --- */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* API Error Notification */}
        {apiError && (
          <div className="col-span-12 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start space-x-3 text-rose-800 text-sm animate-fade-in shadow-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-rose-950">문제가 발생했습니다</h4>
              <p className="mt-0.5 text-rose-800/90">{apiError}</p>
            </div>
            <button 
              onClick={() => setApiError(null)}
              className="text-rose-500 hover:text-rose-700 font-medium text-xs px-2 py-1 rounded hover:bg-rose-100/50 transition"
            >
              닫기
            </button>
          </div>
        )}

        {/* --- LEFT COLUMN: AI COUNSELING CHAT ROOM (7 cols) --- */}
        <section id="chat-counselor-section" className="lg:col-span-7 bg-white rounded-3xl border border-zinc-200/75 shadow-sm overflow-hidden flex flex-col min-h-[620px] lg:min-h-[700px] transition-all">
          
          {/* Section Header */}
          <div className="p-5 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setShowSessionsSidebar(!showSessionsSidebar)}
                className={`p-2 rounded-xl transition ${showSessionsSidebar ? "bg-emerald-50 text-emerald-800" : "text-zinc-400 hover:text-zinc-600"}`}
                title="상담 대화 서랍 열기"
              >
                <History className="w-5 h-5" />
              </button>
              <div className="relative">
                <div className="w-11 h-11 bg-emerald-900 rounded-full flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm">
                  숨
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></span>
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-950 flex items-center space-x-1.5">
                  <span>AI 상담사 '따뜻한 숨'</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-1.5 py-0.5 rounded-md font-medium">격무/민원 전담</span>
                </h2>
                <p className="text-xs text-zinc-500">선생님의 무거운 마음을 있는 그대로 받아안는 다정한 상담실</p>
              </div>
            </div>

            <button
              onClick={handleResetChat}
              className="p-2 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition duration-150 flex items-center space-x-1 text-xs"
              title="상담 대화 초기화"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">새 대화</span>
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* --- COLLAPSIBLE RECENT DISCUSSIONS SIDEBAR --- */}
            {showSessionsSidebar && (
              <div className="w-64 bg-zinc-50/70 border-r border-zinc-200/60 flex flex-col justify-between shrink-0 h-full overflow-y-auto">
                <div className="p-4 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 tracking-wider uppercase flex items-center space-x-1.5">
                    <History className="w-3.5 h-3.5" />
                    <span>지난 상담 기록 목록</span>
                  </h3>
                  
                  {!user ? (
                    <div className="p-4 bg-zinc-100 rounded-xl border border-zinc-200/50 text-center space-y-2">
                      <p className="text-xs text-zinc-500 leading-relaxed">로그인하시면 이전 심리 상담 세션들이 안전하게 클라우드에 영구 백업됩니다.</p>
                      <button 
                        onClick={handleGoogleLogin} 
                        className="w-full py-2 bg-emerald-900 text-white font-bold rounded-lg text-[10px] shadow-sm hover:bg-emerald-800 transition"
                      >
                        구글 로그인
                      </button>
                    </div>
                  ) : sessionsList.length === 0 ? (
                    <div className="p-4 bg-zinc-100 rounded-xl border border-zinc-200/50 text-center text-xs text-zinc-400">
                      진행한 대화 기록이 아직 존재하지 않습니다. 대화를 새로 시작해 보세요!
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {sessionsList.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => handleSelectSession(session.id)}
                          className={`w-full p-2.5 rounded-xl text-xs font-medium text-left flex items-center justify-between cursor-pointer group transition ${
                            activeSessionId === session.id
                              ? "bg-emerald-100 text-emerald-950 shadow-2xs border border-emerald-200/40"
                              : "hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900"
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <span className="block truncate font-bold text-zinc-800">{session.title}</span>
                            <span className="text-[9px] text-zinc-400">{new Date(session.updatedAt).toLocaleDateString()}</span>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSession(e, session.id)}
                            className="p-1 text-zinc-300 hover:text-rose-600 rounded hover:bg-zinc-200/80 group-hover:opacity-100 opacity-0 transition"
                            title="대화 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {user && (
                  <div className="p-3.5 border-t border-zinc-200 bg-zinc-100/50 text-center">
                    <span className="text-[10px] text-zinc-400 font-mono">연동 중: {user.email}</span>
                  </div>
                )}
              </div>
            )}

            {/* --- CHAT INTERACTION WINDOW --- */}
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/10">
                <AnimatePresence initial={false}>
                  {chatMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex items-start gap-2.5 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        
                        {/* Avatar Icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-xs ${
                          msg.role === "user" 
                            ? "bg-amber-50 text-amber-800 border-amber-200" 
                            : "bg-emerald-900 text-white border-emerald-800"
                        }`}>
                          {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>

                        {/* Chat Bubble */}
                        <div className="space-y-1">
                          <div className={`text-[11px] font-medium text-zinc-400 px-1 ${msg.role === "user" ? "text-right" : ""}`}>
                            {msg.role === "user" ? "선생님" : "상담사 따뜻한 숨"}
                          </div>
                          <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-xs ${
                            msg.role === "user"
                              ? "bg-amber-100 text-amber-950 rounded-tr-none border border-amber-200/50"
                              : "bg-white text-zinc-800 rounded-tl-none border border-zinc-200/80 font-serif"
                          }`}>
                            {msg.text}
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  ))}

                  {isChatLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-start"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-900 text-white flex items-center justify-center border border-emerald-800 shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] font-medium text-zinc-400 px-1">따뜻한 숨</div>
                          <div className="px-5 py-3.5 bg-white text-zinc-500 rounded-2xl rounded-tl-none border border-zinc-100 shadow-xs flex items-center space-x-2">
                            <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full animate-bounce delay-100"></span>
                            <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full animate-bounce delay-200"></span>
                            <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full animate-bounce delay-300"></span>
                            <span className="text-xs text-zinc-400 pl-1 font-serif">마음의 고충에 귀 기울이는 중...</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={chatBottomRef} />
              </div>

              {/* Suggested Prompts Grid */}
              {chatMessages.length === 1 && (
                <div className="px-5 py-3 bg-zinc-50/50 border-t border-zinc-100">
                  <p className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-2">💡 이런 고민을 많이 털어놓으십니다 (클릭 시 자동 상담)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STARTER_PROMPTS.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(prompt.text)}
                        className="text-left p-2.5 bg-white hover:bg-emerald-50/40 border border-zinc-200 hover:border-emerald-200 rounded-xl transition duration-200 text-xs text-zinc-700 flex items-start space-x-2.5 shadow-2xs hover:shadow-xs group"
                      >
                        <span className="text-sm shrink-0">{prompt.icon}</span>
                        <div className="flex-1">
                          <span className="block font-semibold text-[10px] text-emerald-800 mb-0.5">{prompt.label}</span>
                          <span className="line-clamp-2 text-zinc-600 leading-normal group-hover:text-zinc-900">{prompt.text}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition shrink-0 mt-2" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Input Bar */}
              <div className="p-4 border-t border-zinc-100 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChat();
                  }}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="상담사에게 털어놓을 이야기를 작성해 보세요..."
                    disabled={isChatLoading}
                    className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isChatLoading}
                    className="p-3 bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl disabled:bg-zinc-200 disabled:text-zinc-400 transition shadow-sm hover:shadow-md shrink-0 flex items-center justify-center"
                  >
                    {isChatLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </form>
                <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400 px-1">
                  <span>🔒 대화와 진단 기록은 클라우드 데이터베이스에 연계되어 보존됩니다.</span>
                  <span className="font-serif">교사 마음 약국</span>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* --- RIGHT COLUMN: INTERACTIVE HEALING TABS (5 cols) --- */}
        <section id="healing-tabs-section" className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* Tab Selector Nav Card */}
          <div className="bg-white rounded-2xl border border-zinc-200/60 p-1.5 flex space-x-1 shadow-2xs">
            <button
              onClick={() => setActiveTab("vent")}
              className={`flex-1 py-2.5 px-1 rounded-xl text-[10px] sm:text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                activeTab === "vent"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>대나무숲 처방전</span>
            </button>
            <button
              onClick={() => setActiveTab("diagnose")}
              className={`flex-1 py-2.5 px-1 rounded-xl text-[10px] sm:text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                activeTab === "diagnose"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>자가진단 & 추이</span>
            </button>
            <button
              onClick={() => setActiveTab("breath")}
              className={`flex-1 py-2.5 px-1 rounded-xl text-[10px] sm:text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                activeTab === "breath"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              <Coffee className="w-4 h-4" />
              <span>마음 안정 호흡</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("analysis");
                fetchStressAnalysis();
              }}
              className={`flex-1 py-2.5 px-1 rounded-xl text-[10px] sm:text-xs font-bold transition flex flex-col items-center justify-center space-y-1 ${
                activeTab === "analysis"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>마음 스트레스 분석</span>
            </button>
          </div>

          {/* Tab Content Container Card */}
          <div className="bg-white rounded-3xl border border-zinc-200/75 p-6 shadow-sm flex-1 flex flex-col justify-between min-h-[500px]">
            <AnimatePresence mode="wait">
              
              {/* --- TAB 1: 대나무숲 마음 처방전 --- */}
              {activeTab === "vent" && (
                <motion.div
                  key="tab-vent"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="space-y-4 flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-orange-50 rounded-lg text-orange-600">
                          <PenTool className="w-4 h-4" />
                        </div>
                        <h3 className="text-base font-bold text-zinc-900">대나무숲 마음 처방전</h3>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      오늘 누구에게도 하지 못했던 서러운 일, 울컥했던 사연을 임금님 귀는 당나귀 귀처럼 거침없이 적어보세요. 마음을 어루만지는 **다정한 위로의 편지**와 행동 처방전을 드립니다.
                    </p>

                    {/* Venting Input (Not submitted yet) */}
                    {!ventPrescription && (
                      <div className="space-y-3.5 pt-2">
                        {/* Category selection */}
                        <div>
                          <label className="block text-[11px] font-bold text-zinc-400 mb-1.5 uppercase">해당되는 고민 분류</label>
                          <div className="flex flex-wrap gap-1.5">
                            {VENT_CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                  selectedCategory === cat.id
                                    ? "bg-emerald-900 text-white border-emerald-900 shadow-2xs"
                                    : "bg-zinc-50 text-zinc-600 border-zinc-200/80 hover:bg-zinc-100"
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Notepad body */}
                        <div className="relative">
                          <textarea
                            value={ventText}
                            onChange={(e) => setVentText(e.target.value)}
                            maxLength={1000}
                            placeholder="예시: 오늘 학부모가 밤늦게 전화를 걸어 학생 지도 방식에 대해 항의했습니다. 교실을 떠나고 싶을 만큼 상처를 크게 받았습니다..."
                            className="w-full h-36 p-4 text-xs bg-amber-50/20 border border-amber-200/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-75/20 focus:border-emerald-800 placeholder-zinc-400/80 resize-none font-serif leading-relaxed"
                          />
                          <div className="absolute bottom-3 right-3 text-[9px] text-zinc-400 bg-white/80 px-2 py-0.5 rounded-full border border-zinc-100">
                            {ventText.length} / 1000 자
                          </div>
                        </div>

                        {/* Prescriptions History list (If logged in) */}
                        {user && prescriptionsList.length > 0 && (
                          <div className="pt-2 border-t border-zinc-100">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">📜 보관된 나의 처방 편지 목록</span>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                              {prescriptionsList.map((rx) => (
                                <div 
                                  key={rx.id} 
                                  onClick={() => handleSelectPrescription(rx)}
                                  className="flex items-center space-x-1.5 bg-amber-50 hover:bg-amber-100/85 border border-amber-200/60 pl-2.5 pr-1.5 py-1.5 rounded-lg text-[11px] font-medium text-amber-950 cursor-pointer transition shadow-2xs"
                                >
                                  <BookOpen className="w-3 h-3 text-amber-800" />
                                  <span className="max-w-[130px] truncate">{rx.letterTitle}</span>
                                  <button
                                    onClick={(e) => handleDeletePrescription(e, rx.id)}
                                    className="p-0.5 rounded text-amber-600 hover:text-rose-600 hover:bg-amber-200 transition"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prescribed Letter Envelope (Ready to open) */}
                    {ventPrescription && !isEnvelopeOpen && (
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="py-10 flex flex-col items-center justify-center space-y-4 bg-amber-50/30 rounded-2xl border border-amber-100/70"
                      >
                        <div className="relative cursor-pointer group" onClick={handleOpenEnvelope}>
                          {/* Envelope Visual */}
                          <div className="w-48 h-32 bg-amber-100/90 rounded-xl shadow-md border border-amber-200/60 flex items-center justify-center relative group-hover:scale-105 group-hover:rotate-1 transition duration-300">
                            <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(210deg,transparent_45%,rgba(217,119,6,0.05)_50%,transparent_55%)]"></div>
                            {/* Seal */}
                            <div className="w-12 h-12 rounded-full bg-emerald-800/90 text-white flex items-center justify-center shadow border-2 border-white/60">
                              <Heart className="w-5 h-5 fill-white" />
                            </div>
                            <span className="absolute bottom-2 text-[10px] text-zinc-500 tracking-wider">클릭하여 편지 열기</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <h4 className="text-sm font-bold text-zinc-800 font-serif">선생님만을 위한 처방 편지가 도착했습니다</h4>
                          <p className="text-xs text-zinc-500 mt-1">밀봉된 마음에 따뜻한 온기를 불어넣어 보세요.</p>
                        </div>
                      </motion.div>
                    )}

                    {/* Prescribed Letter Contents (Opened) */}
                    {ventPrescription && isEnvelopeOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl space-y-3 font-serif max-h-[380px] overflow-y-auto"
                      >
                        <div className="text-center pb-2 border-b border-amber-200/40">
                          <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 tracking-widest">마음 약국 처방전</span>
                          <h4 className="text-base font-bold text-amber-950 mt-2 font-serif">📬 {ventPrescription.letterTitle}</h4>
                        </div>
                        
                        <p className="text-xs text-zinc-800 leading-relaxed whitespace-pre-wrap font-serif text-justify indent-2">
                          {ventPrescription.letterBody}
                        </p>

                        <div className="p-3 bg-white/75 rounded-xl border border-amber-200/30 space-y-1.5">
                          <span className="block text-[10px] font-bold text-zinc-400 tracking-wider font-sans">🩺 오늘의 구체적 힐링 행동</span>
                          <ul className="space-y-1 text-xs text-zinc-700">
                            {ventPrescription.prescription.map((step, idx) => (
                              <li key={idx} className="flex items-start space-x-1.5">
                                <span className="text-emerald-700 font-sans font-bold select-none shrink-0">•</span>
                                <span className="font-sans leading-relaxed text-[11px]">{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="pt-2 text-center border-t border-amber-200/40">
                          <Quote className="w-4 h-4 text-emerald-800/40 mx-auto mb-1" />
                          <p className="text-[11px] italic text-emerald-900 font-bold px-4 leading-relaxed">
                            "{ventPrescription.healingQuote}"
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="pt-4 border-t border-zinc-100 flex items-center space-x-2">
                    {!ventPrescription ? (
                      <button
                        onClick={handleSubmitVent}
                        disabled={!ventText.trim() || isVentingLoading}
                        className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 disabled:bg-zinc-200 text-white font-bold rounded-xl text-xs transition shadow-sm hover:shadow-md flex items-center justify-center space-x-2"
                      >
                        {isVentingLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>위로의 처방 편지를 다듬는 중...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>따뜻한 손편지 처방전 받기</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleResetVent}
                        className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 border border-zinc-200/60"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>다시 털어놓기 (리셋)</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* --- TAB 2: 스트레스 / 번아웃 자가진단 --- */}
              {activeTab === "diagnose" && (
                <motion.div
                  key="tab-diagnose"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="space-y-4 flex-1 flex flex-col justify-between animate-fade-in"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                        <Activity className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-900">교사 번아웃/스트레스 자가진단</h3>
                    </div>

                    {/* Interactive stress trend chart if logged in and data exists */}
                    {user && diagnosesList.length > 0 && !diagnosisResult && !isDiagnosingLoading && (
                      <div className="space-y-3.5 bg-zinc-100/50 p-4 rounded-2xl border border-zinc-200/40">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-emerald-950 flex items-center space-x-1.5">
                            <Sparkle className="w-3 h-3 text-emerald-800 animate-pulse" />
                            <span>선생님의 마음 건강 스트레스 추이</span>
                          </span>
                          <span className="text-[9px] text-zinc-400 font-serif">최근 기록 {diagnosesList.length}건</span>
                        </div>

                        {/* RECHARTS CHART DISPLAY */}
                        <div className="h-44 w-full bg-white rounded-xl p-2 border border-zinc-200/50">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f6f5f2" />
                              <XAxis dataKey="dateStr" stroke="#a1a1aa" fontSize={9} tickLine={false} />
                              <YAxis domain={[0, 10]} stroke="#a1a1aa" fontSize={9} width={15} tickLine={false} />
                              <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "8px" }} />
                              <Legend iconSize={8} wrapperStyle={{ fontSize: "9px", marginTop: "4px" }} />
                              <Line type="monotone" name="탈진" dataKey="정서적 탈진" stroke="#ef4444" strokeWidth={2.2} dot={{ r: 2.5 }} />
                              <Line type="monotone" name="대인관계" dataKey="대인관계 스트레스" stroke="#f59e0b" strokeWidth={2.2} dot={{ r: 2.5 }} />
                              <Line type="monotone" name="행정업무" dataKey="업무 과부하" stroke="#3b82f6" strokeWidth={2.2} dot={{ r: 2.5 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {!diagnosisResult && !isDiagnosingLoading && (
                      <div className="space-y-4">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          지친 마음 상태를 정밀 진단합니다. 학부모 갈등, 행정 압박의 누적 점수를 시각적으로 진단하고 맞춤형 극복 지침을 받아안으세요.
                        </p>

                        {/* Progress Bar of Questions */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-zinc-400">
                            <span>자가진단 문항 진행도</span>
                            <span className="font-bold">{currentQuestionIndex + 1} / {DIAGNOSIS_QUESTIONS.length}</span>
                          </div>
                          <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-800 h-full transition-all duration-300"
                              style={{ width: `${((currentQuestionIndex + 1) / DIAGNOSIS_QUESTIONS.length) * 100}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Question Card */}
                        <div className="p-4 bg-zinc-50 border border-zinc-200/60 rounded-2xl min-h-[90px] flex items-center justify-center text-center">
                          <p className="text-xs font-bold text-zinc-800 font-serif leading-relaxed">
                            " {DIAGNOSIS_QUESTIONS[currentQuestionIndex].text} "
                          </p>
                        </div>

                        {/* Scale Answers Buttons */}
                        <div className="grid grid-cols-1 gap-1.5">
                          {[
                            { score: 0, text: "0. 전혀 그렇지 않다" },
                            { score: 1, text: "1. 대체로 그렇지 않다" },
                            { score: 2, text: "2. 가끔 그렇다" },
                            { score: 3, text: "3. 자주 그렇다" },
                            { score: 4, text: "4. 매우 그렇다 (매일 느낌)" }
                          ].map((ans) => (
                            <button
                              key={ans.score}
                              onClick={() => handleAnswerDiagnosis(ans.score)}
                              className="w-full py-2 px-3.5 bg-white hover:bg-emerald-50 text-left rounded-xl text-xs font-medium border border-zinc-200 hover:border-emerald-300 transition shadow-2xs hover:shadow-xs text-zinc-700 flex justify-between items-center group"
                            >
                              <span>{ans.text}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-emerald-700 transition" />
                            </button>
                          ))}
                        </div>

                        {/* Saved diagnostics history */}
                        {user && diagnosesList.length > 0 && (
                          <div className="pt-2 border-t border-zinc-100">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">📊 과거 마음 진단 리포트 목록</span>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                              {diagnosesList.map((diag) => (
                                <div 
                                  key={diag.id} 
                                  onClick={() => handleSelectDiagnosis(diag)}
                                  className="flex items-center space-x-1.5 bg-zinc-50 hover:bg-emerald-50 border border-zinc-200 pl-2.5 pr-1.5 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-800 cursor-pointer transition shadow-2xs"
                                >
                                  <Calendar className="w-3 h-3 text-emerald-800" />
                                  <span className="max-w-[120px] truncate">{diag.statusTitle}</span>
                                  <button
                                    onClick={(e) => handleDeleteDiagnosis(e, diag.id)}
                                    className="p-0.5 rounded text-zinc-400 hover:text-rose-600 hover:bg-zinc-200/50 transition"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Diagnosis Loading */}
                    {isDiagnosingLoading && (
                      <div className="py-20 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-8 h-8 text-emerald-800 animate-spin" />
                        <div className="text-center space-y-1">
                          <h4 className="text-xs font-bold text-zinc-800">자가진단 수치를 종합 연산하는 중입니다</h4>
                          <p className="text-[10px] text-zinc-400">교사 심리 전문 AI 솔루션을 설계하고 있습니다.</p>
                        </div>
                      </div>
                    )}

                    {/* Diagnosis Results Display */}
                    {diagnosisResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-4 overflow-y-auto max-h-[380px] pr-1"
                      >
                        {/* Header Status Card */}
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                          <span className="text-[10px] font-bold text-emerald-800 tracking-wider">진단 종합 가이드</span>
                          <h4 className="text-sm font-bold text-emerald-950 mt-1">🏷️ {diagnosisResult.statusTitle}</h4>
                        </div>

                        {/* Scores Visualizer (Bars) */}
                        {diagnosisResult.scores && (
                          <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-200/60 rounded-2xl">
                            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide">📊 부문별 스트레스 지표 (0 ~ 10)</span>
                            
                            {/* Exhaustion */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-zinc-700">🩸 정서적 번아웃 & 피로</span>
                                <span className="text-zinc-900">{diagnosisResult.scores.exhaustion}점</span>
                              </div>
                              <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${diagnosisResult.scores.exhaustion * 10}%` }}
                                />
                              </div>
                            </div>

                            {/* Relations */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-zinc-700">👥 민원 & 대인갈등 스트레스</span>
                                <span className="text-zinc-900">{diagnosisResult.scores.relations}점</span>
                              </div>
                              <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${diagnosisResult.scores.relations * 10}%` }}
                                />
                              </div>
                            </div>

                            {/* Admin overload */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-zinc-700">📋 업무 압박 & 잡무 스트레스</span>
                                <span className="text-zinc-900">{diagnosisResult.scores.admin}점</span>
                              </div>
                              <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${diagnosisResult.scores.admin * 10}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Overall analysis explanation */}
                        <div className="space-y-3 pt-1">
                          <div>
                            <span className="text-[11px] font-bold text-emerald-900 block mb-1">💡 마음 종합 분석</span>
                            <p className="text-[11px] text-zinc-700 leading-relaxed font-serif bg-zinc-50/50 p-3 rounded-xl border border-zinc-100">
                              {diagnosisResult.overallAnalysis}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <div className="p-3 bg-rose-50/40 rounded-xl border border-rose-100/60 text-xs">
                              <span className="font-bold text-rose-950 block mb-0.5">❤️ 탈진 솔루션</span>
                              <p className="text-zinc-700 leading-normal text-[11px]">{diagnosisResult.exhaustionFeedback}</p>
                            </div>
                            <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-100/60 text-xs">
                              <span className="font-bold text-amber-950 block mb-0.5">📞 소통과 바운더리 보호</span>
                              <p className="text-zinc-700 leading-normal text-[11px]">{diagnosisResult.relationsFeedback}</p>
                            </div>
                            <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100/60 text-xs">
                              <span className="font-bold text-blue-950 block mb-0.5">📎 업무 에너지 안배</span>
                              <p className="text-zinc-700 leading-normal text-[11px]">{diagnosisResult.adminFeedback}</p>
                            </div>
                          </div>

                          <div className="p-4 bg-emerald-900 text-white rounded-2xl space-y-1.5 shadow-sm">
                            <span className="text-[10px] tracking-wider uppercase font-bold text-emerald-200">🧘 마음 안정 리추얼 제안</span>
                            <p className="text-xs leading-relaxed">{diagnosisResult.copingStrategy}</p>
                          </div>
                        </div>

                      </motion.div>
                    )}
                  </div>

                  {/* Diagnosis actions reset */}
                  {diagnosisResult && (
                    <div className="pt-4 border-t border-zinc-100">
                      <button
                        onClick={handleResetDiagnosis}
                        className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 border border-zinc-200/60"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>자가진단 다시 받기 (또는 트렌드로 돌아가기)</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* --- TAB 3: 마음챙김 안정 호흡 --- */}
              {activeTab === "breath" && (
                <motion.div
                  key="tab-breath"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="space-y-4 flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                        <Coffee className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-900">마음챙김 안정 호흡 (Box Breathing)</h3>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      갑자기 화가 치밀거나, 학부모의 전화를 끝마친 후 손이 떨릴 때 1분 동안 천천히 호흡해 보세요. 혈압을 가라앉히고 즉각적으로 정서 안정을 도모합니다.
                    </p>

                    {/* Interactive breathing panel */}
                    <div className="py-6 flex flex-col items-center justify-center bg-zinc-50/30 rounded-3xl border border-zinc-200/50 min-h-[250px] relative overflow-hidden">
                      <div className="relative flex items-center justify-center w-48 h-48">
                        <AnimatePresence>
                          {breathCycle !== "idle" && (
                            <motion.div
                              className="absolute inset-0 rounded-full bg-emerald-200/30 border border-emerald-300/40"
                              animate={{
                                scale: breathCycle === "inhale" ? [1, 1.25] : breathCycle === "hold" ? 1.25 : breathCycle === "exhale" ? [1.25, 1] : 1,
                              }}
                              transition={{
                                duration: 4,
                                ease: "easeInOut"
                              }}
                            />
                          )}
                        </AnimatePresence>

                        {/* Outer breathing circle */}
                        <motion.div
                          className="w-36 h-36 rounded-full border-2 border-emerald-800/40 flex flex-col items-center justify-center bg-white shadow-md relative z-10"
                          animate={{
                            scale: breathCycle === "inhale" ? 1.25 : breathCycle === "hold" ? 1.25 : breathCycle === "exhale" ? 1.0 : 1.0,
                          }}
                          transition={{
                            duration: 4,
                            ease: "easeInOut"
                          }}
                        >
                          {/* Inner circle with text */}
                          <div className="text-center space-y-1 p-4">
                            <span className="text-[9px] font-bold tracking-widest text-emerald-800 uppercase block">
                              {breathCycle === "idle" ? "대기 중" : breathCycle === "inhale" ? "들숨 (Inhale)" : breathCycle === "hold" ? "멈춤 (Hold)" : "날숨 (Exhale)"}
                            </span>
                            <div className="text-xl font-black text-zinc-900 font-serif">
                              {breathCycle === "idle" ? "🧘" : `${breathTimer}초`}
                            </div>
                            <span className="text-[9px] text-zinc-400 block">
                              {breathCycle === "idle" ? "마음을 가다듬으세요" : `${breathCount}회 완료`}
                            </span>
                          </div>
                        </motion.div>
                      </div>

                      {/* Instructions bar */}
                      <div className="text-center mt-4 max-w-xs px-4">
                        <span className="text-[10px] font-semibold text-emerald-900 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                          {breathCycle === "idle" && "아래의 시작 단추를 누르세요"}
                          {breathCycle === "inhale" && "배를 내밀며 풍선처럼 산소를 들이마시세요"}
                          {breathCycle === "hold" && "산소가 몸 구석구석을 채울 수 있게 잠시 멈춥니다"}
                          {breathCycle === "exhale" && "입술을 둥글게 모아 뜨거운 숨을 끝까지 내보내세요"}
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Action Button */}
                  <div className="pt-4 border-t border-zinc-100">
                    {breathCycle === "idle" ? (
                      <button
                        onClick={startBreathing}
                        className="w-full py-3 bg-emerald-900 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition shadow-sm hover:shadow-md flex items-center justify-center space-x-2"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>안정 호흡 훈련 시작하기</span>
                      </button>
                    ) : (
                      <button
                        onClick={stopBreathing}
                        className="w-full py-3 bg-rose-900 hover:bg-rose-800 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2"
                      >
                        <span>호흡 일시 중지</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* --- TAB 4: 마음 스트레스 입체 분석 --- */}
              {activeTab === "analysis" && (
                <motion.div
                  key="tab-analysis"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="space-y-4 flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-900">대화 기반 스트레스 입체 분석</h3>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      선생님이 상담사와 나눈 실제 고민 대화 기록을 전체적으로 진단하고, 어떤 분야에서 피로도가 축적되고 있는지 분류하여 나만을 위한 1:1 상담 기법을 활성화합니다.
                    </p>

                    {!user ? (
                      <div className="py-12 px-6 bg-zinc-50 rounded-2xl border border-zinc-200 text-center space-y-4">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          대화 기록 스트레스 정밀 분석 서비스는 클라우드 로그인 연동 시에만 작동합니다. 구글 로그인을 진행하신 뒤 다시 요청해 주세요.
                        </p>
                        <button
                          onClick={handleGoogleLogin}
                          className="px-4 py-2 bg-emerald-950 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs shadow-sm transition mx-auto flex items-center justify-center space-x-2 cursor-pointer"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>구글 로그인 연동하기</span>
                        </button>
                      </div>
                    ) : isAnalysisLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-zinc-50/40 rounded-2xl border border-zinc-100">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                        <span className="text-xs font-semibold text-zinc-500 font-serif text-center">대화 기록을 수집하여 스트레스 주범을 정밀 분석 중...</span>
                      </div>
                    ) : !analysisResult ? (
                      <div className="py-12 px-6 bg-zinc-50 rounded-2xl border border-zinc-200 text-center space-y-4">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          아직 대화 기반 스트레스 정량 리포트가 생성되지 않았습니다. 아래의 단추를 눌러 실시간 분석을 진행하세요!
                        </p>
                        <button
                          onClick={() => fetchStressAnalysis(true)}
                          className="px-4 py-2.5 bg-indigo-900 hover:bg-indigo-800 text-white font-bold rounded-xl text-xs transition shadow-sm hover:shadow-md flex items-center space-x-2 mx-auto cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 animate-pulse" />
                          <span>실시간 대화 분석 시작</span>
                        </button>
                      </div>
                    ) : analysisResult.empty ? (
                      <div className="py-12 px-6 bg-zinc-50 rounded-2xl border border-zinc-200 text-center space-y-4">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {analysisResult.message || "분석할 상담 대화 기록이 아직 충분하지 않습니다. AI 상담사와 좀 더 이야기를 나눈 후에 리포트를 요청해 주세요!"}
                        </p>
                        <button
                          onClick={() => fetchStressAnalysis(true)}
                          className="px-4 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-semibold rounded-xl text-xs transition flex items-center space-x-2 mx-auto cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>다시 시도하기</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        
                        {/* 1. Stress Status & Key Metrics */}
                        <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-indigo-800 tracking-wider bg-indigo-100/70 px-2.5 py-0.5 rounded-full border border-indigo-200/50">
                              {analysisResult.diagnosticStatus || "스트레스 분석 완료"}
                            </span>
                            <span className="text-[10px] text-zinc-400">최근 대화 {analysisResult.totalMessagesAnalyzed || 0}개 분석</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-400">선생님을 피로하게 만드는 주 요인</span>
                            <h4 className="text-sm sm:text-base font-black text-zinc-900 font-serif flex items-center space-x-2">
                              <span className="text-xl">🎯</span>
                              <span>{analysisResult.highestCategoryLabel || analysisResult.highestCategory}</span>
                            </h4>
                          </div>
                        </div>

                        {/* 2. Recharts BarChart Visualization */}
                        <div className="bg-white p-3 border border-zinc-150 rounded-2xl shadow-2xs space-y-2">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">📊 스트레스 요인 분포도 (%)</span>
                          <div className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[
                                  { name: "학부모 민원", value: analysisResult.distribution?.complaints || 0, color: "#d97706" },
                                  { name: "행정 업무", value: analysisResult.distribution?.adminWork || 0, color: "#2563eb" },
                                  { name: "수업/지도", value: analysisResult.distribution?.teaching || 0, color: "#10b981" },
                                  { name: "기타 요인", value: analysisResult.distribution?.others || 0, color: "#71717a" },
                                ]}
                                layout="vertical"
                                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                              >
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#52525b" }} width={70} />
                                <Tooltip formatter={(value) => [`${value}%`, "비중"]} contentStyle={{ fontSize: 10, borderRadius: 10 }} />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                                  {[
                                    { color: "#d97706" },
                                    { color: "#2563eb" },
                                    { color: "#10b981" },
                                    { color: "#71717a" }
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 3. Deep Insight */}
                        <div className="space-y-1.5 font-serif text-justify">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">📝 심리상담 분석관 총평</span>
                          <p className="text-xs text-zinc-700 leading-relaxed bg-[#faf8f5] p-3.5 border border-zinc-200/50 rounded-2xl whitespace-pre-wrap font-serif">
                            {analysisResult.overallInsight}
                          </p>
                        </div>

                        {/* 4. Categorized Detailed Breakdown */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">🔎 분야별 세부 정서 상태</span>
                          <div className="grid grid-cols-1 gap-2.5">
                            <div className="p-3 bg-amber-50/40 border border-amber-200/40 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-amber-800">🏫 학부모 민원 요인 ({analysisResult.distribution?.complaints || 0}%)</span>
                              <p className="text-[11px] text-zinc-600 leading-relaxed font-serif">{analysisResult.categoryAnalyses?.complaints}</p>
                            </div>
                            <div className="p-3 bg-blue-50/40 border border-blue-200/40 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-blue-800">📋 행정 업무 요인 ({analysisResult.distribution?.adminWork || 0}%)</span>
                              <p className="text-[11px] text-zinc-600 leading-relaxed font-serif">{analysisResult.categoryAnalyses?.adminWork}</p>
                            </div>
                            <div className="p-3 bg-emerald-50/40 border border-emerald-200/40 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-emerald-800">🧒 수업 및 학생지도 요인 ({analysisResult.distribution?.teaching || 0}%)</span>
                              <p className="text-[11px] text-zinc-600 leading-relaxed font-serif">{analysisResult.categoryAnalyses?.teaching}</p>
                            </div>
                            {analysisResult.distribution?.others > 0 && (
                              <div className="p-3 bg-zinc-100/50 border border-zinc-200/60 rounded-xl space-y-1">
                                <span className="text-[10px] font-bold text-zinc-800">🍂 기타 스트레스 요인 ({analysisResult.distribution?.others || 0}%)</span>
                                <p className="text-[11px] text-zinc-600 leading-relaxed font-serif">{analysisResult.categoryAnalyses?.others}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 5. Custom Counselor Strategy Enabled Banner */}
                        {analysisResult.customCounselAdvice && (
                          <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-2.5">
                            <div className="flex items-center space-x-1.5 text-emerald-900 font-bold text-xs">
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>AI 상담사 '맞춤 특화 모드' 자동 작동 중</span>
                            </div>
                            <p className="text-[11px] text-zinc-600 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-emerald-100/50 font-serif">
                              {analysisResult.customCounselAdvice}
                            </p>
                          </div>
                        )}

                        {/* 6. Practical Action Guide */}
                        {analysisResult.practicalActionGuide && (
                          <div className="p-4 bg-indigo-900 text-white rounded-2xl space-y-2.5 shadow-sm">
                            <span className="text-[10px] tracking-wider uppercase font-bold text-indigo-200 flex items-center space-x-1">
                              <span>🧘 선생님만을 위한 일상 행동 리추얼</span>
                            </span>
                            <ul className="space-y-1.5">
                              {analysisResult.practicalActionGuide.map((guide: string, gIdx: number) => (
                                <li key={gIdx} className="text-xs leading-relaxed flex items-start space-x-2">
                                  <span className="text-indigo-300 font-bold shrink-0">{gIdx + 1}.</span>
                                  <span>{guide}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      </div>
                    )}

                  </div>

                  {user && analysisResult && !analysisResult.empty && (
                    <div className="pt-4 border-t border-zinc-100">
                      <button
                        onClick={() => fetchStressAnalysis(true)}
                        disabled={isAnalysisLoading}
                        className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 border border-zinc-200/60 disabled:opacity-50 cursor-pointer"
                      >
                        {isAnalysisLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        <span>최근 대화 데이터 연동 & 스트레스 분석 업데이트</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>

        </section>

      </main>

      {/* --- SOOTHING FOOTER COMPONENT --- */}
      <footer className="max-w-7xl mx-auto px-4 py-8 mt-8 border-t border-zinc-200/60 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-400">
        <div className="space-y-1 text-center md:text-left">
          <p className="font-medium text-zinc-500">교사 마음 쉼터 © 2026</p>
          <p>대한민국 교사분들의 헌신에 깊은 경의와 감사를 표합니다. 당신의 숨결은 누군가의 미래를 비추는 등대입니다.</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-4">
          <span className="px-2.5 py-1 bg-zinc-100 text-zinc-500 rounded border border-zinc-200/50">비공개 클라우드 동기화 완료</span>
          <span className="font-serif">숨 챙김 리포트 v2.0</span>
        </div>
      </footer>

    </div>
  );
}
