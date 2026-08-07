export type CustomsSystem = "H1" | "H7" | "AES" | "NCTS6" | "G3" | "G4" | "G5" | "EXS" | "POUS" | "DOCUMENTS";
export type CustomsEnvironment = "mock" | "preproduction" | "production";

export type CustomsMessage = {
  caseId: string;
  system: CustomsSystem;
  messageType: string;
  xml: string;
  correlationId?: string;
};

export type CustomsDispatchResult = {
  accepted: boolean;
  environment: CustomsEnvironment;
  correlationId: string;
  httpStatus: number;
  responseXml?: string;
  errors: string[];
};

export type CustomsReadiness = {
  environment: CustomsEnvironment;
  transmissionEnabled: boolean;
  certificateConfigured: boolean;
  endpointsConfigured: CustomsSystem[];
  missing: string[];
};
