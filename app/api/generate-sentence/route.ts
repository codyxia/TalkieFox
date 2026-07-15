import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { NextRequest, NextResponse } from 'next/server';

const openai = createOpenAICompatible({
  baseURL: 'https://opencode.ai/zen/go/v1',
  name: 'openai-compatible',
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface HistoryItem {
  sentence: string;
  transcript: string;
  correct: boolean;
}

interface Scene {
  main: string;
  effect: string;
  bg: string[];
  items: [string, string][];
}

interface Result {
  sentence: string;
  scene: Scene;
}

const EFFECTS = ['blink', 'bounce', 'shake', 'spin', 'float', 'pulse'] as const;

function parseResponse(text: string): Result | null {
  let cleaned = text.trim();
  const blockMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (blockMatch) cleaned = blockMatch[1];

  try {
    const parsed = JSON.parse(cleaned);
    const sentence = parsed.sentence || parsed.sentence_en || '';
    if (!sentence) return null;

    const sceneRaw = parsed.scene || parsed.animation || parsed.emojiScene || {};
    const scene: Scene = {
      main: typeof sceneRaw.main === 'string' ? sceneRaw.main : '😊',
      effect: EFFECTS.includes(sceneRaw.effect) ? sceneRaw.effect : 'float',
      bg: Array.isArray(sceneRaw.bg) ? sceneRaw.bg.slice(0, 4) : [],
      items: Array.isArray(sceneRaw.items)
        ? sceneRaw.items
            .slice(0, 4)
            .filter((item: unknown): item is [string, string] =>
              Array.isArray(item) && item.length >= 2 && typeof item[0] === 'string' && typeof item[1] === 'string',
            )
            .map((item: [string, string]) => [
              item[0],
              (EFFECTS as readonly string[]).includes(item[1]) ? (item[1] as string) : 'float',
            ])
        : [],
    };

    return { sentence, scene };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.time('generate-sentence:total');

    const { history = [] }: { history: HistoryItem[] } = await req.json();

    const recentSentences = history.map(h => h.sentence);
    const recentCorrect = history.filter(h => h.correct).length;
    const totalAttempts = history.length;

    const fewShotExamples = history.length >= 2
      ? history.slice(-4).map(h => h.sentence).join('\n')
      : '';

    console.time('generate-sentence:ai-call');
    const { text } = await generateText({
      model: openai('deepseek-v4-flash'),
      temperature: 1.0,
      system: `你是一位给 8 岁中国孩子教英语的 AI 老师。
先分析最近练习记录，然后生成一个句子和配套的 emoji 场景动画。

可用句子的主题：动物、食物、颜色、天气、数字、身体部位、玩具、衣物、水果、交通工具、形状、家人、动作、情感、场所、自然、文具、饮料

场景主题要和句子内容匹配。比如句子说猫，主 emoji 就用猫。`,
      prompt: `## 最近练习过的句子（不要重复）
${recentSentences.length > 0 ? recentSentences.map((s, i) => `${i + 1}. "${s}"`).join('\n') : '（暂无）'}

## 规则
1. 生成一个适合 8 岁初学者的英文句子，3~8 个单词
2. 句子要和最近练习过的在主题和句式上都不同
3. 设计配套的 emoji 场景来演示句子意思，让孩子一看就懂
4. 只输出 JSON，不要任何其他文字

${fewShotExamples ? `## 最近几句\n${fewShotExamples}\n新句子必须和上面这些不同。\n` : ''}
${history.length > 0 ? `正确率：${recentCorrect}/${totalAttempts}。${recentCorrect > totalAttempts * 0.6 ? '可以稍难一点。' : '保持简单。'}` : '孩子刚开始，用最简单的句子。'}

## JSON 格式
{"sentence": "英文句子", "scene": {"main": "主emoji", "effect": "blink|bounce|shake|spin|float|pulse", "bg": ["背景emoji"], "items": [["补充emoji", "动画"]]}}

## 示例
- "I like ice cream" → {"sentence":"I like ice cream","scene":{"main":"🍦","effect":"bounce","bg":["☀️","🌈"],"items":[["🍪","spin"]]}}
- "The bird can fly" → {"sentence":"The bird can fly","scene":{"main":"🐦","effect":"float","bg":["☁️","️"],"items":[["🌸","float"]]}}
- "The fish is orange" → {"sentence":"The fish is orange","scene":{"main":"🐠","effect":"float","bg":["🌊","🪸"],"items":[["💧","float"]]}}

只输出 JSON，不要任何其他文字。`,
    });
    console.timeEnd('generate-sentence:ai-call');

    console.time('generate-sentence:parse');
    const result = parseResponse(text);
    if (!result) {
      const sentence = text.replace(/^["']|["']$/g, '').trim().split('\n')[0];
      console.timeEnd('generate-sentence:total');
      return NextResponse.json({
        sentence: sentence || 'Hello, let us learn!',
        scene: { main: '😊', effect: 'float', bg: ['⭐'], items: [] },
      });
    }

    console.timeEnd('generate-sentence:parse');
    console.timeEnd('generate-sentence:total');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Generate sentence error:', error);
    return NextResponse.json(
      {
        sentence: 'Let us try again!',
        scene: { main: '🌈', effect: 'float', bg: ['⭐', '☀️'], items: [] },
      },
      { status: 200 },
    );
  }
}
