import { useState, useEffect, useRef } from 'react';
import { Caption, VideoSource } from '../types';

// Define as URLs do backend para desenvolvimento e produção.
// `import.meta.env.DEV` é uma variável especial do Vite que é `true` durante o desenvolvimento.
const isDevelopment = import.meta.env.DEV;

// A URL de produção foi baseada na sua última mensagem. A porta 8000 para desenvolvimento foi lida do seu arquivo `backend_port.json`.
const BACKEND_URL = isDevelopment
    ? 'http://localhost:8000/api'
    : 'https://backendnoxsub.onrender.com/api';
// Função para testar se o backend está disponível
async function testBackendConnection(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout

        const response = await fetch(`${BACKEND_URL}/health`, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok || response.status === 200;
    } catch (error) {
        console.warn(`Backend em ${BACKEND_URL} não está disponível:`, error);
        if (error instanceof TypeError && error.message.includes('CORS')) {
            console.info('Servidor pode estar rodando mas com problema de CORS');
            return true;
        }
        return false;
    }
}

export const useCaptionGenerator = (
    videoSource: VideoSource | null,
    videoDuration: number,
    language: string,
    model: string = 'small',
    shouldGenerate: boolean = false
) => {
    const [captions, setCaptions] = useState<Caption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingText, setLoadingText] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [stepId, setStepId] = useState<string | number | null>(null);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const cleanup = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const cancelTranscription = () => {
        cleanup();
        setIsLoading(false);
        setLoadingText('Transcrição cancelada');
        setElapsed(0);
        setError(null);
        setStepId(null);
    };

    useEffect(() => {
        if (!videoSource || videoDuration <= 0 || !shouldGenerate) return;

        const generateCaptions = async () => {
            setIsLoading(true);
            setError(null);
            setElapsed(0);
            setLoadingText('Verificando conexão com o servidor...');
            setStepId(null);

            abortControllerRef.current = new AbortController();

            try {
                // Testar conexão com o backend antes de prosseguir
                setLoadingText('Verificando servidor backend...');
                const isBackendAvailable = await testBackendConnection();
                if (!isBackendAvailable) {
                    throw new Error(`Não foi possível conectar ao servidor backend em ${BACKEND_URL}.`);
                }

                setLoadingText('Baixando vídeo...');

                // Download do vídeo com timeout
                const videoResponse = await fetch(videoSource.url, {
                    signal: abortControllerRef.current.signal
                });

                if (!videoResponse.ok) {
                    throw new Error(`Não foi possível baixar o vídeo. Status: ${videoResponse.status}`);
                }

                const blob = await videoResponse.blob();
                const file = new File([blob], videoSource.filename || 'video.mp4', { type: blob.type });
                const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                setLoadingText('Preparando transcrição...');

                const formData = new FormData();
                formData.append('file', file);
                formData.append('model', model);
                formData.append('language', language);
                formData.append('session_id', sessionId);

                // Iniciar timer
                timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

                // Não há suporte a EventSource no Vercel Python, então pula status SSE

                // Fazer a requisição de transcrição
                setLoadingText('Enviando vídeo para transcrição...');
                const backendResponse = await fetch(`${BACKEND_URL}/transcribe`, {
                    method: 'POST',
                    body: formData,
                    mode: 'cors',
                    credentials: 'omit',
                    signal: abortControllerRef.current.signal,
                });

                if (!backendResponse.ok) {
                    const errorText = await backendResponse.text();
                    throw new Error(`Erro do servidor (${backendResponse.status}): ${errorText}`);
                }

                const responseJson = await backendResponse.json();
                const parsedCaptions = responseJson.captions || responseJson;

                if (Array.isArray(parsedCaptions) && parsedCaptions.length > 0) {
                    setCaptions(parsedCaptions);
                    setLoadingText('Transcrição concluída!');
                } else {
                    console.warn('Nenhuma legenda foi gerada, criando legenda padrão');
                    setCaptions([{
                        id: 1,
                        start: 0,
                        end: Math.min(5, videoDuration),
                        text: "Digite sua primeira legenda aqui."
                    }]);
                    setLoadingText('Transcrição não gerou resultados');
                }

            } catch (e: any) {
                console.error("Erro ao gerar legendas:", e);

                let errorMsg = 'Erro desconhecido';

                if (e.name === 'AbortError') {
                    errorMsg = 'Operação cancelada pelo usuário';
                } else if (e.name === 'TypeError' && (e.message.includes('Failed to fetch') || e.message.includes('CORS'))) {
                    errorMsg = 'Erro de conectividade ou CORS. Verifique se:\n' +
                        '1. O backend está rodando e acessível\n' +
                        '2. O servidor backend permite requisições CORS';
                } else if (e.message.includes('não está rodando') || e.message.includes('não foi possível conectar')) {
                    errorMsg = e.message;
                } else {
                    errorMsg = e.message || String(e);
                }

                setError(`Falha ao gerar legendas: ${errorMsg}`);

                // Criar legenda padrão apenas se não foi cancelado
                if (e.name !== 'AbortError') {
                    setCaptions([{
                        id: 1,
                        start: 0,
                        end: Math.min(5, videoDuration),
                        text: "Digite sua primeira legenda aqui."
                    }]);
                }
            } finally {
                if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                    setIsLoading(false);
                    if (!error) {
                        setLoadingText('');
                    }
                    setStepId(null);
                }
                cleanup();
            }
        };

        generateCaptions();
        return cleanup;
    }, [videoSource, videoDuration, language, model, shouldGenerate]);

    const downloadRenderedVideo = async (quality: 'low' | 'medium' | 'high' = 'medium') => {
        try {
            if (!videoSource || captions.length === 0) {
                throw new Error('Vídeo ou legendas não disponíveis.');
            }

            // Testar conexão antes de prosseguir
            const isBackendAvailable = await testBackendConnection();
            if (!isBackendAvailable) {
                throw new Error(`Servidor backend não está disponível.`);
            }

            const response = await fetch(videoSource.url);
            if (!response.ok) {
                throw new Error(`Não foi possível baixar o vídeo. Status: ${response.status}`);
            }

            const blob = await response.blob();
            const file = new File([blob], videoSource.filename || 'video.mp4', { type: blob.type });
            const captionsFile = new File([JSON.stringify(captions, null, 2)], 'captions.json', {
                type: 'application/json'
            });

            const formData = new FormData();
            formData.append('file', file);
            formData.append('captions', captionsFile);
            formData.append('quality', quality);

            const backendResponse = await fetch(`${BACKEND_URL}/render`, {
                method: 'POST',
                body: formData,
                mode: 'cors',
                credentials: 'omit',
            });

            if (!backendResponse.ok) {
                const errorText = await backendResponse.text();
                throw new Error(`Erro do servidor (${backendResponse.status}): ${errorText}`);
            }

            // Recebe o nome do arquivo gerado
            const json = await backendResponse.json();
            const filename = json.filename;
            if (!filename) throw new Error('Arquivo legendado não gerado.');
            const fileUrl = `${BACKEND_URL}/files/${filename}`;

            // Faz o download via GET
            const fileResponse = await fetch(fileUrl);
            if (!fileResponse.ok) throw new Error('Falha ao baixar o arquivo legendado.');
            const videoBlob = await fileResponse.blob();
            const url = URL.createObjectURL(videoBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

        } catch (e: any) {
            const errorMsg = e.message || String(e);
            console.error('Erro ao baixar vídeo legendado:', e);
            alert(`Erro ao baixar vídeo legendado: ${errorMsg}`);
        }
    };

    return {
        captions,
        isLoading,
        error,
        setCaptions,
        downloadRenderedVideo,
        loadingText,
        elapsed,
        cancelTranscription,
        stepId
    };
};
