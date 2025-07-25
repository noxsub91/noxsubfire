import { useState, useEffect, useRef } from 'react';
import { Caption, VideoSource } from '../types';

<<<<<<< HEAD
const BACKEND_URL = 'https://backendnoxsub.onrender.com';


// É uma boa prática centralizar a URL do seu backend
// para alternar facilmente entre desenvolvimento e produção.
const isProduction = process.env.NODE_ENV === 'production';

// Use a URL do Render em produção, e localhost para desenvolvimento.
// A porta 8000 para desenvolvimento foi baseada no seu arquivo backend_port.json.
const API_BASE_URL = isProduction
    ? 'https://backendnoxsub.onrender.com'
    : 'http://localhost:8000';

/**
 * Testa se a conexão com o backend está ativa.
 * A função agora usa uma URL base configurada (API_BASE_URL)
 * em vez de receber a porta como parâmetro.
 * @returns {Promise<boolean>} Verdadeiro se o backend responder, falso caso contrário.
 */
=======
// Define as URLs do backend para desenvolvimento e produção.
// `import.meta.env.DEV` é uma variável especial do Vite que é `true` durante o desenvolvimento.
const isDevelopment = import.meta.env.DEV;

// A URL de produção foi baseada na sua última mensagem. A porta 8000 para desenvolvimento foi lida do seu arquivo `backend_port.json`.
const BACKEND_URL = isDevelopment
    ? 'http://localhost:8000/api'
    : 'https://backendnoxsub.onrender.com/api';
// Função para testar se o backend está disponível
>>>>>>> 76f280b (Alteracao front urls)
async function testBackendConnection(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

        const healthCheckUrl = `${API_BASE_URL}/api/health`;

        const response = await fetch(healthCheckUrl, {
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
        // response.ok é verdadeiro para status na faixa 200-299, o que é mais limpo.
        return response.ok;
    } catch (error) {
<<<<<<< HEAD
        console.warn(`A conexão com o backend em ${API_BASE_URL} falhou:`, error);
        // A sua lógica original para erros de CORS é mantida.
        // Um erro de CORS pode indicar que o servidor está no ar, mas mal configurado.
=======
        console.warn(`Backend em ${BACKEND_URL} não está disponível:`, error);
>>>>>>> 76f280b (Alteracao front urls)
        if (error instanceof TypeError && error.message.includes('CORS')) {
            console.info('O servidor parece estar online, mas há um problema de configuração de CORS.');
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
