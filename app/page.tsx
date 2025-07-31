// app/page.tsx (Updated to be a simple landing page and marked as client component)
// 이 파일은 앱의 기본 루트 페이지입니다. 채팅 페이지로의 링크를 제공합니다.
"use client"; // 이 줄을 추가하여 클라이언트 컴포넌트로 지정합니다.

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-800">
      <div className="bg-white p-10 rounded-xl shadow-2xl text-center max-w-md w-full border border-gray-200">
        <h1 className="text-5xl font-extrabold mb-6 text-blue-700 animate-fade-in-down">
          Welcome to Lifo App!
        </h1>
        <p className="text-lg mb-8 leading-relaxed text-gray-600 animate-fade-in-up">
          당신의 감정, 가치관, 행동을 기록하고 AI와 함께 인생 포트폴리오를 만들어보세요.
        </p>
        <a
          href="/chat"
          className="inline-block px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          대화 시작하기
        </a>
      </div>
      {/* Tailwind CSS 애니메이션을 위한 스타일 (globals.css에 포함되어야 함) */}
      <style jsx global>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fadeInDown 1s ease-out forwards;
        }
        .animate-fade-in-up {
          animation: fadeInUp 1s ease-out 0.5s forwards;
        }
      `}</style>
    </main>
  );
}

