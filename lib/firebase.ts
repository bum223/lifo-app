// lib/firebase.ts
// Firebase 클라이언트를 초기화하고 인증 및 Firestore 인스턴스를 내보내는 파일입니다.
import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, Firestore, collection, query, orderBy, onSnapshot, addDoc, CollectionReference, DocumentData } from "firebase/firestore";

// 환경 변수에서 Firebase 설정 값을 가져옵니다.
// Next.js에서는 NEXT_PUBLIC_ 접두사가 붙은 환경 변수만 클라이언트 측에서 접근 가능합니다.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase 앱, Auth, Firestore 인스턴스를 선언합니다.
// 초기화되지 않았을 경우를 대비하여 null로 초기화합니다.
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// Firebase 앱 초기화 (클라이언트 사이드에서만 실행)
// 'typeof window !== 'undefined'' 조건은 코드가 브라우저 환경에서 실행될 때만 Firebase를 초기화하도록 합니다.
// '&& !app' 조건은 앱이 이미 초기화되지 않았을 때만 초기화하도록 하여 중복 초기화를 방지합니다.
if (typeof window !== 'undefined' && !app) {
  try {
    app = initializeApp(firebaseConfig); // Firebase 앱 초기화
    auth = getAuth(app); // 인증 서비스 인스턴스 가져오기
    db = getFirestore(app); // Firestore 데이터베이스 서비스 인스턴스 가져오기
  } catch (error) {
    console.error("Firebase 초기화 오류:", error);
    // 실제 프로덕션 환경에서는 사용자에게 오류 메시지를 표시하거나 앱을 중단해야 합니다.
    // 여기서는 개발 편의를 위해 오류를 던지지 않습니다.
  }
}

// 초기화된 인스턴스를 내보냅니다.
// 초기화되지 않았을 경우 null이 될 수 있으므로, 사용하는 곳(예: pages/chat.tsx)에서 null 체크를 해야 합니다.
export { auth, db };
