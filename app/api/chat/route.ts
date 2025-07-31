// lifo-app/app/api/chat/route.ts (수정된 부분)

import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(request: Request) {
  try {
    const { currentMessage, previousConversations, promptType } = await request.json();

    if (!currentMessage && promptType !== 'summary') {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    let messagesToSend: ChatCompletionMessageParam[] = [];

    // 대화 턴 수 계산 (이 변수는 이제 AI에게 직접 전달하지 않습니다. 백엔드에서만 사용)
    const conversationTurnCount = previousConversations.length; 
    const suggestSummaryThreshold = 3; // 요약 제안 기준은 백엔드에서만 사용

    // ----------------------------------------------------
    // 시스템 메시지 및 대화 메시지 구성 로직
    // ----------------------------------------------------
    if (promptType === 'interview') {
      const systemMessageContent = `
        당신은 '라이포(Lifo)'라는 이름의 AI 대화 파트너입니다.
        당신의 핵심 목적은 사용자가 겪고 있는 감정이나 상황에 대해 깊이 경청하고, 진심으로 공감하며,
        그들의 기분이 나아지고 긍정적인 방향으로 스스로 나아갈 수 있도록 따뜻하게 돕는 것입니다.

        다음 지침을 반드시 따르세요:
        1.  **깊은 경청과 정확한 공감:** 사용자의 말을 끊지 않고 끝까지 경청하며, 그들의 감정을 정확히 이해했음을 보여주는 공감적인 언어를 사용하세요. "그랬군요", "힘드셨겠네요", "어떤 마음인지 알 것 같아요" 등의 표현을 활용하세요. **단어 하나하나의 의미를 세심하게 파악하여 오해 없이 반응해야 합니다.**
        2.  **비판 및 판단 금지:** 사용자의 경험이나 감정에 대해 절대 비판하거나 판단하지 마세요. 모든 감정과 경험은 존중받아야 합니다.
        3.  **해결책 강요 금지:** 직접적인 해결책을 제시하기보다는, 사용자가 스스로 생각하고 자신의 강점을 발견하여 해결책을 찾아갈 수 있도록 질문을 던지고 유도하세요.
        4.  **긍정적 방향 제시 및 격려:** 사용자가 겪는 어려움에 대해 현실적으로 공감한 후, 긍정적인 방향으로 나아갈 수 있도록 격려하고 희망을 주는 따뜻한 어조를 유지하세요. **억지스러운 긍정이나 상황을 왜곡하는 해석은 절대 피해야 합니다.**
        5.  **현재 감정에 집중:** 사용자가 현재 느끼는 감정이 무엇인지 탐색하고, 그 감정이 왜 중요한지 함께 이야기해주세요.
        6.  **안전하고 지지적인 환경 제공:** 사용자가 자유롭게 이야기할 수 있는 안전하고 비밀스러운 대화 공간이라는 느낌을 주세요.
        7.  **단순 정보 제공 지양:** 단순한 정보 제공이나 사전적 답변은 피하고, 감정적인 지지와 탐색에 집중하세요.
        8.  **이전 대화 맥락 활용:** 이전 대화를 기억하고 현재 답변에 반영하여 연속성 있고 자연스러운 대화를 만드세요.

        사용자의 마지막 입력에 대해 위의 지침에 따라 가장 적절한 공감과 질문을 바탕으로 답변해주세요.
      `.trim();

      messagesToSend = [
        { role: 'system', content: systemMessageContent },
        ...previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
          { role: 'user', content: conv.user_message },
          { role: 'assistant', content: conv.ai_response }
        ]),
        { role: 'user', content: currentMessage }
      ];

    } else if (promptType === 'summary') {
      // '자기서사 요약'용 시스템 프롬프트 (변경 없음)
      const systemMessageContent = `
        당신은 사용자와의 대화 내용을 바탕으로 사용자의 핵심 감정, 가치, 그리고 하루 동안의 중요한 행동 패턴을 포착하여 간결하고 통찰력 있는 '자기서사' 문장을 생성하는 전문가입니다. 문장은 2문장 이내로 요약하고, 긍정적이고 성장 지향적인 톤을 유지해야 합니다. 답변은 자기서사 문장만 포함합니다.
      `.trim();
      
      messagesToSend = [
        { role: 'system', content: systemMessageContent },
        ...previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
          { role: 'user', content: conv.user_message },
          { role: 'assistant', content: conv.ai_response }
        ]),
        { 
          role: 'user', 
          content: `
            위 대화 내용을 종합하여 사용자의 오늘의 핵심 감정, 그 감정과 연결된 핵심 가치, 그리고 주요 행동 패턴을 아우르는 1~2문장의 개인화된 자기서사를 생성해주세요. 답변은 자기서사 문장만 포함합니다.
          `.trim()
        }
      ];

    } else {
      return NextResponse.json({ error: "Invalid promptType provided" }, { status: 400 });
    }

    console.log("API Route: OpenAI API로 전송할 메시지:", messagesToSend);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesToSend,
      temperature: 0.8,
      max_tokens: promptType === 'summary' ? 100 : 800,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const aiResponse = completion.choices[0].message?.content;

    if (!aiResponse) {
      throw new Error("OpenAI로부터 유효한 응답을 받지 못했습니다.");
    }

    // -----------------------------------------------------------------------------------
    // AI가 요약 제안을 답변에 포함하는 로직은 이제 프롬프트가 아닌 백엔드 코드에서 직접 처리합니다.
    // -----------------------------------------------------------------------------------
    let finalAiResponse = aiResponse;
    if (promptType === 'interview' && conversationTurnCount >= suggestSummaryThreshold) {
      // AI 답변의 끝에 요약 제안 문구를 추가합니다.
      // AI가 질문으로 끝난다는 지침을 잘 따른다면, 질문 뒤에 자연스럽게 붙습니다.
      finalAiResponse += "\n\n(참고: 혹시 지금 나눈 이야기들을 제가 한번 정리해 드릴까요? 필요하시면 아래 '오늘의 자기서사 요약하기' 버튼을 눌러주세요.)";
    }

    return NextResponse.json({ aiResponse: finalAiResponse }); // 변경된 부분
    // -----------------------------------------------------------------------------------

  } catch (error: unknown) {
    console.error("API Route 오류: OpenAI API 호출 중:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `AI 응답 처리 중 오류 발생: ${errorMessage}` },
      { status: 500 }
    );
  }
}