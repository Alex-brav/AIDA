const REACTIONS = {
    cool: 'Put sunglasses on when task has been nailed, or "good news have been delivered"',
    alert: 'Use the "!!!" to indicate a new important  or urgentnotification came in.',
}

function asPrompt() {
    const lines = Object.entries(REACTIONS).map(([name, meaning]) => `[${name}] ${meaning}`);
    return (
        'You have a body that can react while you talk. To react, start your reply with exactly one of these tags, ' +
        'with nothing before it:\n' +
        `${lines.join('\n')}\n` +
        'Most replies should have no tag. Never use any other tag, and never mention the tags.'
    );
}

// Read tags
function createTagReader(onPiece, onAction) {
    let start = '';
    let decide = false;

    function pass(text) {
        if(text && onPiece) onPiece(text);
    }

    return function push(piece) {
        if (decide) return pass(piece);
        start += piece;
        const trimmed = start.trimStart();
        if (trimmed.length === 0 ) return;

        if (!trimmed.startsWith('[')) {
            decide = true;
            return pass(start);
        }

        const end = trimmed.indexOf(']');
        if (end === -1) {
            if(trimmed.length > 20) {
                decide = true;
                pass(start);
            }
            return;
        }

        decide = true;
        const name = trimmed.slice(1, end).trim().toLowerCase();
        if (REACTIONS[name]) {
            if (onAction) onAction({ type: 'emote', name });
            pass(trimmed.slice(end + 1).trimStart());
        } else {
            pass(start);
        }
    };
}

module.exports = {
    asPrompt,
    createTagReader,
};