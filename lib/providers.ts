import { xai } from '@ai-sdk/xai';

export function getModel(model: string) {
    const [provider, ...modelNameParts] = model.split(':') ?? [];
    const modelName = modelNameParts.join(':');
    return xai(modelName);
}

export function isProviderEnabled(providerId: string): boolean {
    if (providerId === 'xai') {
        return !!process.env.XAI_API_KEY;
    }
    return false;
} 