import { PlatformConfig } from "../server";
import { PluginType } from "../api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginRequest = Record<string, any> & (InterfaceRequest | TerminateRequest);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginResponse = Record<string, any>;

export type PluginResponseHandler = PluginResponseHandlerWithResponse | PluginResponseHandlerWithConfiguration;
export type PluginResponseHandlerWithResponse = (response: PluginResponse) => void;
export type PluginResponseHandlerWithConfiguration = (response: null | undefined, type: PluginType, replace: boolean, config: PlatformConfig) => void;


export type Request = NegotiateRequest | InterfaceRequest | TerminateRequest;
export type Response = NegotiateResponse | InterfaceResponse;

export enum RequestType {
    NEGOTIATE = "Negotiate",
    INTERFACE = "Interface",
    TERMINATE = "Terminate",
}

export enum ResponseType {
    NEGOTIATE = "Negotiate",
    INTERFACE = "Interface",
}

export enum ActionType {
    MANAGE_PLATFORM = "Manage Platform",
    MANAGE_ACCESSORIES = "Manage Accessories",
}


export interface RequestBase {
    tid: number; //transactionId
    type: RequestType;
    sid?: string; // sessionUUID (must be present in all request beyond negotiation)
}

export interface NegotiateRequest extends RequestBase {
    type: RequestType.NEGOTIATE;
    sid: undefined;

    language: string; // four letter language code like "en-US"
}

export interface InterfaceRequest extends RequestBase {
    type: RequestType.INTERFACE;
    sid: string;

    // this is basically to response to our response only present in "AWAIT_SELECTION" and "LIST_PLATFORMS"
    response?: {
        selections: number[]; // represents the index of the selected item(s) (currently we only check for the first item)
    };
}

export interface TerminateRequest extends RequestBase {
    type: RequestType.TERMINATE;
    sid: string;
}


export interface ResponseBase {
    tid: number; // transactionId
    type: ResponseType;
    sid: string; // sessionUUID
}

export interface NegotiateResponse extends ResponseBase {
    type: ResponseType.NEGOTIATE;

    attachment: Omit<InterfaceListResponse<ActionType>, keyof { tid: number; sid: string }>;
}

export interface InterfaceResponse extends ResponseBase {
    type: ResponseType.INTERFACE;

    interface: InterfaceType;
    title: string;
}

export enum InterfaceType {
    LIST = "list",
    INSTRUCTION = "instruction",
}

export interface InterfaceListResponse<L> extends InterfaceResponse {
    interface: InterfaceType.LIST;

    items: L[];
}

export interface InterfaceInstructionResponse extends InterfaceResponse {
    interface: InterfaceType.INSTRUCTION;

    detail: string;
    showNextButton: boolean;
    heroImage?: string; // this is only some easter egg stuff, we have to type it though :sweat_smile:
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlatformContext = Record<string, any> & {
    // original api specifies this with a type :(
    // noinspection SpellCheckingInspection
    preferedLanguage: string;
}
