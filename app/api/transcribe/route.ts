import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ transcript: '' }, { status: 400 });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ transcript: '' }, { status: 500 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': audioFile.type || 'audio/webm',
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Deepgram error:', response.status, errText);
      return NextResponse.json({ transcript: '' }, { status: 502 });
    }

    const data = await response.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ transcript: '' }, { status: 500 });
  }
}
