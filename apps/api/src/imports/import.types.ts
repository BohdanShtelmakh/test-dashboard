export interface NormalizedColumn {
  position: number;
  name: string;
  key: string;
}

export type InferredColumnType =
  'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME';

export interface InferredColumn extends NormalizedColumn {
  type: InferredColumnType;
  nullable: boolean;
}
