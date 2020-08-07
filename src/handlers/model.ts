export interface NewMessageRequestBody {
    title: string;
    description: string;
    username: string;
}

export interface Message {
    uuid: string;
    title: string;
    description: string;
    username: string;
    createdAt: number;
}
