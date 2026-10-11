/**
 * Poolside model identifiers are the raw hosted ids. The host namespaces model
 * identifiers per provider-entry group (`<vendor>/<group>/<id>`), so no
 * extension-side qualification is needed.
 */
export function providerModelId(modelId: string): string {
  return modelId;
}
