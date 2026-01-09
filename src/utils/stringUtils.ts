/**
 * Capitalize the first letter of each word in a name
 * Example: "john doe" -> "John Doe"
 */
export function capitalizeName(name: string): string {
    if (!name) return name;

    return name
        .trim()
        .split(/\s+/) // Split by whitespace
        .map(word => {
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}
