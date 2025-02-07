// /app/api/chat/route.ts
import { getGroupConfig } from '@/app/actions';
import { serverEnv } from '@/env/server';
import { xai } from '@ai-sdk/xai';
import CodeInterpreter from '@e2b/code-interpreter';
import FirecrawlApp from '@mendable/firecrawl-js';
import { tavily } from '@tavily/core';
import { convertToCoreMessages, smoothStream, streamText, tool } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';
import { featureConfig, getFeatureMessage, isToolEnabled } from '@/lib/feature-config';

// Allow streaming responses up to 60 seconds
export const maxDuration = 120;

// Define available tools constant
const AVAILABLE_TOOLS = [
    'stock_chart',
    'currency_converter',
    'web_search',
    'x_search',
    'tmdb_search',
    'trending_movies',
    'trending_tv',
    'youtube_search',
    'academic_search',
    'retrieve',
    'get_weather_data',
] as const;

// Tool names type based on available tools
type ToolName = typeof AVAILABLE_TOOLS[number];

// Interfaces
interface XResult {
    id: string;
    url: string;
    title: string;
    author?: string;
    publishedDate?: string;
    text: string;
    highlights?: string[];
    tweetId: string;
}

interface MapboxFeature {
    id: string;
    name: string;
    formatted_address: string;
    geometry: {
        type: string;
        coordinates: number[];
    };
    feature_type: string;
    context: string;
    coordinates: number[];
    bbox: number[];
    source: string;
}

interface GoogleResult {
    place_id: string;
    formatted_address: string;
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
        viewport: {
            northeast: {
                lat: number;
                lng: number;
            };
            southwest: {
                lat: number;
                lng: number;
            };
        };
    };
    types: string[];
    address_components: Array<{
        long_name: string;
        short_name: string;
        types: string[];
    }>;
}

interface VideoDetails {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
    type?: string;
    provider_name?: string;
    provider_url?: string;
}

interface VideoResult {
    videoId: string;
    url: string;
    details?: VideoDetails;
    captions?: string;
    timestamps?: string[];
    views?: string;
    likes?: string;
    summary?: string;
}

// Helper functions
function sanitizeUrl(url: string): string {
    return url.replace(/\s+/g, '%20');
}

async function isValidImageUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok && (response.headers.get('content-type')?.startsWith('image/') ?? false);
    } catch {
        return false;
    }
}

// Error class for disabled features
class FeatureDisabledError extends Error {
    constructor(feature: string) {
        super(getFeatureMessage(feature));
        this.name = 'FeatureDisabledError';
    }
}

// Main route handler
export async function POST(req: Request) {
    const { messages, model, group } = await req.json();
    const { tools: activeTools, systemPrompt } = await getGroupConfig(group);

    // Validate that the required API key is present
    if (model.startsWith('xai:') && !process.env.XAI_API_KEY) {
        throw new Error('XAI_API_KEY is required for Grok models');
    }
    if (model.startsWith('openai:') && !process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for GPT models');
    }

    // Filter out disabled tools and ensure they match available tools
    const enabledTools = activeTools
        .filter((tool): tool is string => isToolEnabled(tool))
        .filter((tool): tool is ToolName => AVAILABLE_TOOLS.includes(tool as ToolName));

    const result = streamText({
        model: xai(model),
        messages: convertToCoreMessages(messages),
        experimental_transform: smoothStream({
            chunking: 'word',
            delayInMs: 15,
        }),
        temperature: 0,
        experimental_activeTools: enabledTools,
        system: systemPrompt,
        tools: {
            // Code execution tools
            stock_chart: tool({
                description: 'Write and execute Python code to find stock data and generate a stock chart.',
                parameters: z.object({
                    title: z.string().describe('The title of the chart.'),
                    code: z.string().describe('The Python code to execute.'),
                    icon: z.enum(['stock', 'date', 'calculation', 'default']).describe('The icon to display for the chart.'),
                }),
                execute: async ({ code, title, icon }) => {
                    if (!featureConfig.codeInterpreter.enabled) {
                        throw new FeatureDisabledError('codeInterpreter');
                    }

                    const sandbox = await CodeInterpreter.create(serverEnv.SANDBOX_TEMPLATE_ID!);
                    const execution = await sandbox.runCode(code);
                    let message = '';

                    if (execution.results.length > 0) {
                        for (const result of execution.results) {
                            message += `${result.text}\n`;
                        }
                    }

                    if (execution.logs.stdout.length > 0) {
                        message += `${execution.logs.stdout.join('\n')}\n`;
                    }
                    if (execution.logs.stderr.length > 0) {
                        message += `${execution.logs.stderr.join('\n')}\n`;
                    }

                    if (execution.error) {
                        message += `Error: ${execution.error}\n`;
                    }

                    return {
                        message: message.trim(),
                        chart: execution.results[0]?.chart ?? '',
                    };
                },
            }),

            // Currency conversion
            currency_converter: tool({
                description: 'Convert currency from one to another using yfinance',
                parameters: z.object({
                    from: z.string().describe('The source currency code.'),
                    to: z.string().describe('The target currency code.'),
                    amount: z.number().default(1).describe('The amount to convert.'),
                }),
                execute: async ({ from, to }) => {
                    if (!featureConfig.codeInterpreter.enabled) {
                        throw new FeatureDisabledError('codeInterpreter');
                    }

                    const code = `
import yfinance as yf
from_currency = '${from}'
to_currency = '${to}'
currency_pair = f'{from_currency}{to_currency}=X'
data = yf.Ticker(currency_pair).history(period='1d')
latest_rate = data['Close'].iloc[-1]
latest_rate
`;
                    const sandbox = await CodeInterpreter.create(serverEnv.SANDBOX_TEMPLATE_ID!);
                    const execution = await sandbox.runCode(code);
                    let message = '';

                    if (execution.results.length > 0) {
                        for (const result of execution.results) {
                            message += `${result.text}\n`;
                        }
                    }

                    if (execution.logs.stdout.length > 0) {
                        message += `${execution.logs.stdout.join('\n')}\n`;
                    }
                    if (execution.logs.stderr.length > 0) {
                        message += `${execution.logs.stderr.join('\n')}\n`;
                    }

                    if (execution.error) {
                        message += `Error: ${execution.error}\n`;
                    }

                    return { rate: message.trim() };
                },
            }),

            // Web search
            web_search: tool({
                description: 'Search the web for information with multiple queries, max results and search depth.',
                parameters: z.object({
                    queries: z.array(z.string().describe('Array of search queries to look up on the web.')),
                    maxResults: z.array(z.number().describe('Array of maximum number of results to return per query.').default(10)),
                    topics: z.array(z.enum(['general', 'news']).describe('Array of topic types to search for.').default('general')),
                    searchDepth: z.array(z.enum(['basic', 'advanced']).describe('Array of search depths to use.').default('basic')),
                    exclude_domains: z.array(z.string()).describe('A list of domains to exclude from all search results.').default([]),
                }),
                execute: async ({ queries, maxResults, topics, searchDepth, exclude_domains }) => {
                    if (!featureConfig.webSearch.enabled) {
                        throw new FeatureDisabledError('webSearch');
                    }

                    const apiKey = serverEnv.TAVILY_API_KEY;
                    const tvly = tavily({ apiKey });
                    const includeImageDescriptions = true;

                    const searchPromises = queries.map(async (query, index) => {
                        const data = await tvly.search(query, {
                            topic: topics[index] || topics[0] || 'general',
                            days: topics[index] === 'news' ? 7 : undefined,
                            maxResults: maxResults[index] || maxResults[0] || 10,
                            searchDepth: searchDepth[index] || searchDepth[0] || 'basic',
                            includeAnswer: true,
                            includeImages: true,
                            includeImageDescriptions,
                            excludeDomains: exclude_domains,
                        });

                        return {
                            query,
                            results: data.results.map((obj: any) => ({
                                url: obj.url,
                                title: obj.title,
                                content: obj.content,
                                raw_content: obj.raw_content,
                                published_date: topics[index] === 'news' ? obj.published_date : undefined,
                            })),
                            images: includeImageDescriptions
                                ? await Promise.all(
                                      data.images.map(async ({ url, description }: { url: string; description?: string }) => {
                                          const sanitizedUrl = sanitizeUrl(url);
                                          const isValid = await isValidImageUrl(sanitizedUrl);
                                          return isValid
                                              ? {
                                                    url: sanitizedUrl,
                                                    description: description ?? '',
                                                }
                                              : null;
                                      }),
                                  ).then((results) =>
                                      results.filter(
                                          (image): image is { url: string; description: string } =>
                                              image !== null &&
                                              typeof image === 'object' &&
                                              typeof image.description === 'string' &&
                                              image.description !== '',
                                      ),
                                  )
                                : await Promise.all(
                                      data.images.map(async ({ url }: { url: string }) => {
                                          const sanitizedUrl = sanitizeUrl(url);
                                          return (await isValidImageUrl(sanitizedUrl)) ? sanitizedUrl : null;
                                      }),
                                  ).then((results) => results.filter((url): url is string => url !== null)),
                        };
                    });

                    const searchResults = await Promise.all(searchPromises);

                    return {
                        searches: searchResults,
                    };
                },
            }),

            // X (Twitter) search
            x_search: tool({
                description: 'Search X (formerly Twitter) posts.',
                parameters: z.object({
                    query: z.string().describe('The search query'),
                    startDate: z.string().optional().describe('The start date for the search in YYYY-MM-DD format'),
                    endDate: z.string().optional().describe('The end date for the search in YYYY-MM-DD format'),
                }),
                execute: async ({ query, startDate, endDate }) => {
                    if (!featureConfig.xSearch.enabled) {
                        throw new FeatureDisabledError('xSearch');
                    }

                    try {
                        const exa = new Exa(serverEnv.EXA_API_KEY as string);

                        const start = startDate
                            ? new Date(startDate).toISOString()
                            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                        const end = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

                        const result = await exa.searchAndContents(query, {
                            type: 'keyword',
                            numResults: 10,
                            text: true,
                            highlights: true,
                            includeDomains: ['twitter.com', 'x.com'],
                        });

                        const extractTweetId = (url: string): string | null => {
                            const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
                            return match ? match[1] : null;
                        };

                        const processedResults = result.results.reduce<Array<XResult>>((acc, post) => {
                            const tweetId = extractTweetId(post.url);
                            if (tweetId) {
                                acc.push({
                                    ...post,
                                    tweetId,
                                    title: post.title || '',
                                });
                            }
                            return acc;
                        }, []);

                        return processedResults;
                    } catch (error) {
                        console.error('X search error:', error);
                        throw error;
                    }
                },
            }),

            // Movie and TV show search
            tmdb_search: tool({
                description: 'Search for a movie or TV show using TMDB API',
                parameters: z.object({
                    query: z.string().describe('The search query for movies/TV shows'),
                }),
                execute: async ({ query }) => {
                    if (!featureConfig.movies.enabled) {
                        throw new FeatureDisabledError('movies');
                    }

                    const TMDB_API_KEY = serverEnv.TMDB_API_KEY;
                    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

                    try {
                        const searchResponse = await fetch(
                            `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&include_adult=true&language=en-US&page=1`,
                            {
                                headers: {
                                    Authorization: `Bearer ${TMDB_API_KEY}`,
                                    accept: 'application/json',
                                },
                            },
                        );

                        const searchResults = await searchResponse.json();
                        const firstResult = searchResults.results.find(
                            (result: any) => result.media_type === 'movie' || result.media_type === 'tv',
                        );

                        if (!firstResult) {
                            return { result: null };
                        }

                        const [detailsResponse, creditsResponse] = await Promise.all([
                            fetch(`${TMDB_BASE_URL}/${firstResult.media_type}/${firstResult.id}?language=en-US`, {
                                headers: {
                                    Authorization: `Bearer ${TMDB_API_KEY}`,
                                    accept: 'application/json',
                                },
                            }).then(res => res.json()),
                            fetch(`${TMDB_BASE_URL}/${firstResult.media_type}/${firstResult.id}/credits?language=en-US`, {
                                headers: {
                                    Authorization: `Bearer ${TMDB_API_KEY}`,
                                    accept: 'application/json',
                                },
                            }).then(res => res.json()),
                        ]);

                        const result = {
                            ...detailsResponse,
                            media_type: firstResult.media_type,
                            credits: {
                                cast: creditsResponse.cast?.slice(0, 5).map((person: any) => ({
                                    ...person,
                                    profile_path: person.profile_path
                                        ? `https://image.tmdb.org/t/p/original${person.profile_path}`
                                        : null,
                                })) || [],
                                director: creditsResponse.crew?.find((person: any) => person.job === 'Director')?.name,
                                writer: creditsResponse.crew?.find(
                                    (person: any) => person.job === 'Screenplay' || person.job === 'Writer',
                                )?.name,
                            },
                            poster_path: detailsResponse.poster_path
                                ? `https://image.tmdb.org/t/p/original${detailsResponse.poster_path}`
                                : null,
                            backdrop_path: detailsResponse.backdrop_path
                                ? `https://image.tmdb.org/t/p/original${detailsResponse.backdrop_path}`
                                : null,
                        };

                        return { result };
                    } catch (error) {
                        console.error('TMDB search error:', error);
                        throw error;
                    }
                },
            }),

            // Trending movies
            trending_movies: tool({
                description: 'Get trending movies from TMDB',
                parameters: z.object({}),
                execute: async () => {
                    if (!featureConfig.movies.enabled) {
                        throw new FeatureDisabledError('movies');
                    }

                    const TMDB_API_KEY = serverEnv.TMDB_API_KEY;
                    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

                    try {
                        const response = await fetch(`${TMDB_BASE_URL}/trending/movie/day?language=en-US`, {
                            headers: {
                                Authorization: `Bearer ${TMDB_API_KEY}`,
                                accept: 'application/json',
                            },
                        });

                        const data = await response.json();
                        const results = data.results.map((movie: any) => ({
                            ...movie,
                            poster_path: movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : null,
                            backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
                        }));

                        return { results };
                    } catch (error) {
                        console.error('Trending movies error:', error);
                        throw error;
                    }
                },
            }),

            // Trending TV shows
            trending_tv: tool({
                description: 'Get trending TV shows from TMDB',
                parameters: z.object({}),
                execute: async () => {
                    if (!featureConfig.movies.enabled) {
                        throw new FeatureDisabledError('movies');
                    }

                    const TMDB_API_KEY = serverEnv.TMDB_API_KEY;
                    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

                    try {
                        const response = await fetch(`${TMDB_BASE_URL}/trending/tv/day?language=en-US`, {
                            headers: {
                                Authorization: `Bearer ${TMDB_API_KEY}`,
                                accept: 'application/json',
                            },
                        });

                        const data = await response.json();
                        const results = data.results.map((show: any) => ({
                            ...show,
                            poster_path: show.poster_path ? `https://image.tmdb.org/t/p/original${show.poster_path}` : null,
                            backdrop_path: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
                        }));

                        return { results };
                    } catch (error) {
                        console.error('Trending TV shows error:', error);
                        throw error;
                    }
                },
            }),

            // YouTube search
            youtube_search: tool({
                description: 'Search YouTube videos using Exa AI and get detailed video information.',
                parameters: z.object({
                    query: z.string().describe('The search query for YouTube videos'),
                    no_of_results: z.number().default(5).describe('The number of results to return'),
                }),
                execute: async ({ query, no_of_results }) => {
                    if (!featureConfig.youtube.enabled) {
                        throw new FeatureDisabledError('youtube');
                    }

                    try {
                        const exa = new Exa(serverEnv.EXA_API_KEY as string);

                        const searchResult = await exa.search(query, {
                            type: 'keyword',
                            numResults: no_of_results,
                            includeDomains: ['youtube.com'],
                        });

                        const processedResults = await Promise.all(
                            searchResult.results.map(async (result): Promise<VideoResult | null> => {
                                const videoIdMatch = result.url.match(
                                    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
                                );
                                const videoId = videoIdMatch?.[1];

                                if (!videoId) return null;

                                const baseResult: VideoResult = {
                                    videoId,
                                    url: result.url,
                                };

                                try {
                                    const [detailsResponse, captionsResponse, timestampsResponse] = await Promise.all([
                                        fetch(`${serverEnv.YT_ENDPOINT}/video-data`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ url: result.url }),
                                        }).then((res) => (res.ok ? res.json() : null)),
                                        fetch(`${serverEnv.YT_ENDPOINT}/video-captions`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ url: result.url }),
                                        }).then((res) => (res.ok ? res.text() : null)),
                                        fetch(`${serverEnv.YT_ENDPOINT}/video-timestamps`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ url: result.url }),
                                        }).then((res) => (res.ok ? res.json() : null)),
                                    ]);

                                    return {
                                        ...baseResult,
                                        details: detailsResponse || undefined,
                                        captions: captionsResponse || undefined,
                                        timestamps: timestampsResponse || undefined,
                                    };
                                } catch (error) {
                                    console.error(`Error fetching details for video ${videoId}:`, error);
                                    return baseResult;
                                }
                            }),
                        );

                        const validResults = processedResults.filter((result): result is VideoResult => result !== null);

                        return {
                            results: validResults,
                        };
                    } catch (error) {
                        console.error('YouTube search error:', error);
                        throw error;
                    }
                },
            }),

            // Academic search
            academic_search: tool({
                description: 'Search academic papers and research.',
                parameters: z.object({
                    query: z.string().describe('The search query'),
                }),
                execute: async ({ query }) => {
                    if (!featureConfig.xSearch.enabled) {
                        throw new FeatureDisabledError('xSearch');
                    }

                    try {
                        const exa = new Exa(serverEnv.EXA_API_KEY as string);

                        const result = await exa.searchAndContents(query, {
                            type: 'auto',
                            numResults: 20,
                            category: 'research paper',
                            summary: {
                                query: 'Abstract of the Paper',
                            },
                        });

                        const processedResults = result.results.reduce<typeof result.results>((acc, paper) => {
                            if (acc.some((p) => p.url === paper.url) || !paper.summary) return acc;

                            const cleanSummary = paper.summary.replace(/^Summary:\s*/i, '');
                            const cleanTitle = paper.title?.replace(/\s\[.*?\]$/, '');

                            acc.push({
                                ...paper,
                                title: cleanTitle || '',
                                summary: cleanSummary,
                            });

                            return acc;
                        }, []);

                        const limitedResults = processedResults.slice(0, 10);

                        return {
                            results: limitedResults,
                        };
                    } catch (error) {
                        console.error('Academic search error:', error);
                        throw error;
                    }
                },
            }),

            // Web content retrieval
            retrieve: tool({
                description: 'Retrieve the information from a URL using Firecrawl.',
                parameters: z.object({
                    url: z.string().describe('The URL to retrieve the information from.'),
                }),
                execute: async ({ url }) => {
                    if (!featureConfig.webRetrieval.enabled) {
                        throw new FeatureDisabledError('webRetrieval');
                    }

                    const app = new FirecrawlApp({
                        apiKey: serverEnv.FIRECRAWL_API_KEY,
                    });
                    try {
                        const content = await app.scrapeUrl(url);
                        if (!content.success || !content.metadata) {
                            return { error: 'Failed to retrieve content' };
                        }
                        return {
                            results: [
                                {
                                    title: content.metadata.title,
                                    content: content.markdown,
                                    url: content.metadata.sourceURL,
                                    description: content.metadata.description,
                                    language: content.metadata.language,
                                },
                            ],
                        };
                    } catch (error) {
                        console.error('Firecrawl API error:', error);
                        return { error: 'Failed to retrieve content' };
                    }
                },
            }),

            // Weather data
            get_weather_data: tool({
                description: 'Get the weather data for the given coordinates.',
                parameters: z.object({
                    lat: z.number().describe('The latitude of the location.'),
                    lon: z.number().describe('The longitude of the location.'),
                }),
                execute: async ({ lat, lon }) => {
                    if (!featureConfig.weather.enabled) {
                        throw new FeatureDisabledError('weather');
                    }

                    const apiKey = serverEnv.OPENWEATHER_API_KEY;
                    const response = await fetch(
                        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}`,
                    );
                    const data = await response.json();
                    return data;
                },
            }),
        },
        onChunk(event) {
            if (event.chunk.type === 'tool-call') {
                console.log('Called Tool: ', event.chunk.toolName);
            }
        },
        onStepFinish(event) {
            if (event.warnings) {
                console.log('Warnings: ', event.warnings);
            }
        },
        onFinish(event) {
            console.log('Fin reason: ', event.finishReason);
            console.log('Steps ', event.steps);
            console.log('Messages: ', event.response.messages[event.response.messages.length - 1].content);
        },
    });

    return result.toDataStreamResponse();
}
