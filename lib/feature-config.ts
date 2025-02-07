import { serverEnv, getAvailableFeatures } from '@/env/server';
import { isAnalyticsEnabled, isMapsEnabled } from '@/env/client';

export interface FeatureConfig {
  enabled: boolean;
  name: string;
  description: string;
  fallbackBehavior?: string;
  fallbackMessage?: string;
}

const features = getAvailableFeatures();

export const featureConfig: Record<string, FeatureConfig> = {
  analytics: {
    enabled: isAnalyticsEnabled(),
    name: "Analytics",
    description: "Track usage and performance metrics",
    fallbackMessage: "Analytics is currently disabled.",
  },
  webSearch: {
    enabled: features.webSearch,
    name: "Web Search",
    description: "Search the web for information",
    fallbackMessage: "Web search is currently unavailable. Please try using a regular search engine.",
  },
  xSearch: {
    enabled: features.xSearch,
    name: "X (Twitter) Search",
    description: "Search X (formerly Twitter) posts",
    fallbackMessage: "X search is currently unavailable. Please visit X.com directly.",
  },
  movies: {
    enabled: features.movies,
    name: "Movie Information",
    description: "Get movie and TV show information",
    fallbackMessage: "Movie information is currently unavailable. Try visiting IMDB or another movie database.",
  },
  youtube: {
    enabled: features.youtube,
    name: "YouTube Search",
    description: "Search and get information from YouTube videos",
    fallbackMessage: "YouTube search is currently unavailable. Please visit YouTube directly.",
  },
  webRetrieval: {
    enabled: features.webRetrieval,
    name: "Web Content Retrieval",
    description: "Extract content from web pages",
    fallbackMessage: "Web content retrieval is currently unavailable.",
  },
  weather: {
    enabled: features.weather,
    name: "Weather Information",
    description: "Get weather forecasts and information",
    fallbackMessage: "Weather information is currently unavailable. Please check your local weather service.",
  },
  codeInterpreter: {
    enabled: features.codeInterpreter,
    name: "Code Interpreter",
    description: "Execute Python code and generate charts",
    fallbackMessage: "Code execution is currently unavailable.",
  },
  maps: {
    enabled: isMapsEnabled(),
    name: "Maps and Location",
    description: "Get location information and directions",
    fallbackMessage: "Maps functionality is currently unavailable. Please use Google Maps directly.",
  },
  places: {
    enabled: features.places && isMapsEnabled(),
    name: "Places Search",
    description: "Find nearby places and businesses",
    fallbackMessage: "Places search is currently unavailable. Try using Google Maps or TripAdvisor directly.",
  },
  flights: {
    enabled: features.flights,
    name: "Flight Tracking",
    description: "Track flight status and information",
    fallbackMessage: "Flight tracking is currently unavailable. Please check with your airline directly.",
  }
};

export const getEnabledTools = () => {
  const enabledTools: string[] = [];
  
  if (featureConfig.webSearch.enabled) enabledTools.push('web_search');
  if (featureConfig.xSearch.enabled) enabledTools.push('x_search');
  if (featureConfig.movies.enabled) {
    enabledTools.push('tmdb_search');
    enabledTools.push('trending_movies');
    enabledTools.push('trending_tv');
  }
  if (featureConfig.youtube.enabled) enabledTools.push('youtube_search');
  if (featureConfig.webRetrieval.enabled) enabledTools.push('retrieve');
  if (featureConfig.weather.enabled) enabledTools.push('get_weather_data');
  if (featureConfig.codeInterpreter.enabled) {
    enabledTools.push('code_interpreter');
    enabledTools.push('stock_chart');
    enabledTools.push('currency_converter');
  }
  if (featureConfig.maps.enabled) {
    enabledTools.push('find_place');
    enabledTools.push('text_search');
  }
  if (featureConfig.places.enabled) enabledTools.push('nearby_search');
  if (featureConfig.flights.enabled) enabledTools.push('track_flight');
  
  return enabledTools;
};

export const isToolEnabled = (toolName: string) => {
  return getEnabledTools().includes(toolName);
};

export const getFeatureMessage = (feature: string) => {
  return featureConfig[feature]?.fallbackMessage || "This feature is currently unavailable.";
};