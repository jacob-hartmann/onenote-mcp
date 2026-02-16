/**
 * Graph API Type Definitions
 *
 * TypeScript interfaces for Microsoft Graph OneNote API responses.
 * These map to the JSON representations returned by the v1.0 API.
 */

export interface GraphIdentity {
  id?: string;
  displayName?: string;
}

export interface GraphIdentitySet {
  user?: GraphIdentity;
  application?: GraphIdentity;
  device?: GraphIdentity;
}

export interface GraphExternalLink {
  href: string;
}

export interface GraphNotebookLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphSectionLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphPageLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphNotebook {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  isDefault: boolean;
  isShared: boolean;
  userRole: "Owner" | "Contributor" | "Reader" | "None";
  links: GraphNotebookLinks;
  sectionsUrl: string;
  sectionGroupsUrl: string;
  self: string;
  // Expanded relationships
  sections?: GraphSection[];
  sectionGroups?: GraphSectionGroup[];
}

export interface GraphSectionGroup {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  sectionsUrl: string;
  sectionGroupsUrl: string;
  self: string;
  // Expanded relationships
  parentNotebook?: GraphNotebook;
  parentSectionGroup?: GraphSectionGroup;
  sections?: GraphSection[];
  sectionGroups?: GraphSectionGroup[];
}

export interface GraphSection {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  isDefault: boolean;
  links: GraphSectionLinks;
  pagesUrl: string;
  self: string;
  // Expanded relationships
  parentNotebook?: GraphNotebook;
  parentSectionGroup?: GraphSectionGroup;
}

export interface GraphPage {
  id: string;
  title: string;
  contentUrl: string;
  createdByAppId?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  level?: number;
  order?: number;
  self: string;
  links: GraphPageLinks;
  // Expanded relationships
  parentSection?: GraphSection;
  parentNotebook?: GraphNotebook;
}

export interface GraphPagePreview {
  "@odata.context"?: string;
  previewText: string;
}

export interface GraphODataCollection<T> {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
  value: T[];
}
