// lifo-app/app/chat/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db, app } from "@/lib/firebase"; // <-- 'app' 인스턴스도 임포트합니다.
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  Timestamp 
} from "firebase/firestore"; 
import { 
  User, 
  onAuthStateChanged,         
  signInWithCustomToken,      
  signInAnonymously           
} from "firebase/auth"; 

interface Conversation {
  id: string; 
  user_id: string;
  user_message: string;
  ai_response: string;
  created_at: number;
}

export default function ChatPage() {
  const [input, setInput] = useState("");                     
  const [conversations, setConversations] = useState<Conversation[]>([]); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);     
  const [loading, setLoading] = useState(true);               
  const [error, setError] = useState<string | null>(null);   

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Canvas 환경 특정 변수 제거 및 Firebase 앱 ID 직접 사용
  // const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; // 제거
  // const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // 제거

  // Firebase 앱 인스턴스에서 직접 app.options.appId를 가져옵니다.
  // 이 값은 lib/firebase.ts에서 NEXT_PUBLIC_FIREBASE_APP_ID 환경 변수로 설정됩니다.
  const firebaseAppId = app.options.appId; 

  useEffect(() => {
    console.log("ChatPage useEffect: Setting up auth and firestore...");

    const setupAuthAndFirestore = async () => {
      setLoading(true);
      setError(null);

      if (!auth || !db || !firebaseAppId) { // firebaseAppId도 유효성 검사 추가
        console.error("Firebase 인스턴스가 유효하지 않거나 앱 ID를 가져올 수 없습니다. auth:", auth, "db:", db, "appId:", firebaseAppId);
        setError("Firebase가 초기화되지 않았거나 앱 ID를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.");
        setLoading(false);
        return;
      }

      try {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          if (user) {
            console.log("User authenticated:", user.uid);
            setCurrentUser(user);
            const userId = user.uid;

            // `appId` 대신 `firebaseAppId` 사용
            const conversationsCollectionRef = collection(db, `artifacts/${firebaseAppId}/users/${userId}/conversations`);
            const q = query(conversationsCollectionRef, orderBy("created_at", "asc"));

            const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
              console.log("Firestore snapshot received.");
              const fetchedConversations: Conversation[] = [];
              snapshot.forEach((doc) => {
                const data = doc.data();
                const createdAt = data.created_at instanceof Timestamp ? data.created_at.toMillis() : data.created_at;
                
                fetchedConversations.push({
                  id: doc.id,
                  user_id: data.user_id,
                  user_message: data.user_message,
                  ai_response: data.ai_response,
                  created_at: createdAt,
                });
              });
              setConversations(fetchedConversations);
              setLoading(false);
            }, (firestoreError) => {
              console.error("Firestore 데이터 불러오기 오류:", firestoreError);
              setError(`대화 기록 불러오기 오류: ${firestoreError.message}`);
              setLoading(false);
            });

            return () => unsubscribeFirestore();

          } else {
            console.log("No user, attempting anonymous sign-in.");
            try {
              // __initial_auth_token 관련 로직 제거, 익명 로그인만 시도
              await signInAnonymously(auth);
              console.log("Signed in anonymously.");
            } catch (authError: unknown) { 
              console.error("Firebase 인증 오류:", authError);
              setError(`인증 오류: ${authError instanceof Error ? authError.message : String(authError)}. Firebase 설정을 확인하세요.`);
              setLoading(false);
            }
          }
        });

        return () => unsubscribeAuth();

      } catch (err: unknown) {
        console.error("앱 초기 설정 오류:", err);
        setError(`앱 초기화 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    setupAuthAndFirestore();
  }, [firebaseAppId]); // 의존성 배열도 `firebaseAppId`로 변경

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations]);

  const handleSend = async () => {
    if (!input.trim() || !currentUser) {
      setError("메시지를 입력하거나 사용자 인증이 필요합니다.");
      return;
    }

    setLoading(true);
    setError(null);
    
    const userMessage = input;
    setInput("");

    if (!db) {
      setError("Firebase 데이터베이스가 초기화되지 않았습니다.");
      setLoading(false);
      return;
    }

    try {
      console.log("Sending message to AI and Firestore...");

      const previousMessagesForAI = conversations.map(c => ({
        user_message: c.user_message,
        ai_response: c.ai_response
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          currentMessage: userMessage, 
          previousConversations: previousMessagesForAI 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP 오류: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.aiResponse;
      console.log("AI Response received from API Route:", aiResponse);

      const userId = currentUser.uid;
      // `appId` 대신 `firebaseAppId` 사용
      const conversationsCollectionRef = collection(db, `artifacts/${firebaseAppId}/users/${userId}/conversations`);

      await addDoc(conversationsCollectionRef, {
        user_id: userId,
        user_message: userMessage,
        ai_response: aiResponse,
        created_at: serverTimestamp(),
      });
      console.log("Message saved to Firestore.");

    } catch (err: unknown) {
      console.error("메시지 전송 오류:", err);
      setError(`메시지 전송 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !currentUser) {
    return <div className="p-6 text-center text-gray-600">앱을 불러오는 중입니다...</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">오늘 하루, 어땠나요?</h1>

      {currentUser && (
        <div className="text-sm text-gray-500 mb-4 text-center">
          사용자 ID: <span className="font-mono bg-gray-100 p-1 rounded">{currentUser.uid}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">오류: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="space-y-4 mb-6 h-96 overflow-y-auto border p-4 rounded-lg bg-gray-50">
        {conversations.length === 0 && !loading && (
          <p className="text-center text-gray-500">아직 대화 기록이 없습니다. 첫 질문을 시작해보세요!</p>
        )}
        {conversations.map((conv) => (
          <div key={conv.id} className="flex flex-col space-y-1">
            <div className="bg-blue-100 p-3 rounded-lg self-end max-w-[80%]">
              <span className="font-semibold text-blue-800">🙋 사용자: </span>
              {conv.user_message}
            </div>
            <div className="bg-green-100 p-3 rounded-lg self-start max-w-[80%]">
              <span className="font-semibold text-green-800">🤖 AI: </span>
              {conv.ai_response}
            </div>
            <div className="text-xs text-gray-400 self-end">
              {conv.created_at ? new Date(conv.created_at).toLocaleString() : '날짜 없음'}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
        {loading && currentUser && (
          <div className="text-center text-gray-500">메시지를 보내는 중...</div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="오늘의 감정을 입력해보세요..."
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
          disabled={loading}
        >
          보내기
        </button>
      </div>
    </div>
  );
}