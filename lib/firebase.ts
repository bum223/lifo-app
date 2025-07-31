// lifo-app/lib/firebase.ts
// Firebase 앱 초기화 및 인스턴스 내보내기

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 다음 임포트들은 이 파일에서 직접 사용되지 않으므로 제거합니다.
// import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, CollectionReference, DocumentData } from "firebase/firestore";
// import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "firebase/auth";


// Firebase 구성 정보 (환경 변수에서 불러옵니다.)
// Vercel에서 NEXT_PUBLIC_ 접두사는 브라우저에서도 사용 가능하게 합니다.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, 
};

// Firebase 앱이 이미 초기화되었는지 확인하여 중복 초기화를 방지합니다.
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Firebase Auth 및 Firestore 인스턴스 가져오기
const auth = getAuth(app);
const db = getFirestore(app);

// 필요한 인스턴스만 내보냅니다.
export { auth, db, app };