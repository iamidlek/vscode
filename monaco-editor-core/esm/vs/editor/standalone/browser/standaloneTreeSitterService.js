/**
 * The monaco build doesn't like the dynamic import of tree sitter in the real service.
 * We use a dummy service here to make the build happy.
 */
export class StandaloneTreeSitterParserService {
}
