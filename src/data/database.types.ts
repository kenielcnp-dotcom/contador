
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string,"group_id": string,"id": string,"kind": string,"name": string,"opening_balance_cents": number | null,"opening_balance_date": string | null,"owner_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string,"group_id": string,"id"?: string,"kind"?: string,"name": string,"opening_balance_cents"?: number | null,"opening_balance_date"?: string | null,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string,"group_id"?: string,"id"?: string,"kind"?: string,"name"?: string,"opening_balance_cents"?: number | null,"opening_balance_date"?: string | null,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_group_id_owner_id_fkey"
      columns: ["group_id","owner_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    }
                  ]
                },"activity_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity": string,"entity_id": string | null,"group_id": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"group_id": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"group_id"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"entity_id": string,"entity_type": string,"file_name": string,"group_id": string,"id": string,"mime_type": string,"size_bytes": number,"storage_path": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"entity_id": string,"entity_type": string,"file_name": string,"group_id": string,"id"?: string,"mime_type": string,"size_bytes": number,"storage_path": string,"uploaded_by"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"entity_id"?: string,"entity_type"?: string,"file_name"?: string,"group_id"?: string,"id"?: string,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bill_occurrences": {
                  Row: {
                    "amount_cents": number,"bill_id": string,"created_at": string,"due_date": string,"group_id": string,"id": string,"notes": string | null,"paid_at": string | null,"paid_cents": number,"scheduled_date": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"bill_id": string,"created_at"?: string,"due_date": string,"group_id": string,"id"?: string,"notes"?: string | null,"paid_at"?: string | null,"paid_cents"?: number,"scheduled_date": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"bill_id"?: string,"created_at"?: string,"due_date"?: string,"group_id"?: string,"id"?: string,"notes"?: string | null,"paid_at"?: string | null,"paid_cents"?: number,"scheduled_date"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_occurrences_bill_id_group_id_fkey"
      columns: ["bill_id","group_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "bill_occurrences_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"bills": {
                  Row: {
                    "account_id": string | null,"active": boolean,"amount_cents": number,"category_id": string | null,"created_at": string,"created_by": string,"description": string,"end_date": string | null,"group_id": string,"id": string,"kind": string,"notes": string | null,"recurrence": string,"responsible_id": string | null,"split_mode": string,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"active"?: boolean,"amount_cents": number,"category_id"?: string | null,"created_at"?: string,"created_by"?: string,"description": string,"end_date"?: string | null,"group_id": string,"id"?: string,"kind"?: string,"notes"?: string | null,"recurrence"?: string,"responsible_id"?: string | null,"split_mode"?: string,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"active"?: boolean,"amount_cents"?: number,"category_id"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"end_date"?: string | null,"group_id"?: string,"id"?: string,"kind"?: string,"notes"?: string | null,"recurrence"?: string,"responsible_id"?: string | null,"split_mode"?: string,"start_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_account_id_group_id_fkey"
      columns: ["account_id","group_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "bills_category_id_group_id_fkey"
      columns: ["category_id","group_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "bills_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_group_id_responsible_id_fkey"
      columns: ["group_id","responsible_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    }
                  ]
                },"budgets": {
                  Row: {
                    "alert_thresholds": (number)[],"category_id": string | null,"created_at": string,"created_by": string,"group_id": string,"id": string,"kind": string,"limit_cents": number,"member_id": string | null,"month": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_thresholds"?: (number)[],"category_id"?: string | null,"created_at"?: string,"created_by"?: string,"group_id": string,"id"?: string,"kind": string,"limit_cents": number,"member_id"?: string | null,"month": string,"updated_at"?: string
                  }
                  Update: {
                    "alert_thresholds"?: (number)[],"category_id"?: string | null,"created_at"?: string,"created_by"?: string,"group_id"?: string,"id"?: string,"kind"?: string,"limit_cents"?: number,"member_id"?: string | null,"month"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_group_id_fkey"
      columns: ["category_id","group_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "budgets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budgets_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budgets_group_id_member_id_fkey"
      columns: ["group_id","member_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"group_id": string,"icon": string | null,"id": string,"is_default": boolean,"kind": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"group_id": string,"icon"?: string | null,"id"?: string,"is_default"?: boolean,"kind": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"group_id"?: string,"icon"?: string | null,"id"?: string,"is_default"?: boolean,"kind"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_splits": {
                  Row: {
                    "group_id": string,"percent": number | null,"share_cents": number,"transaction_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"percent"?: number | null,"share_cents": number,"transaction_id": string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"percent"?: number | null,"share_cents"?: number,"transaction_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_splits_group_id_user_id_fkey"
      columns: ["group_id","user_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "expense_splits_transaction_id_group_id_fkey"
      columns: ["transaction_id","group_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id","group_id"]
    }
                  ]
                },"financial_groups": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"max_members": number,"name": string,"owner_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"max_members"?: number,"name": string,"owner_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"max_members"?: number,"name"?: string,"owner_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_contributions": {
                  Row: {
                    "amount_cents": number,"cancelled_at": string | null,"client_request_id": string,"contributed_at": string,"created_at": string,"created_by": string,"from_account_id": string | null,"goal_id": string,"group_id": string,"id": string,"member_id": string | null,"notes": string | null,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"cancelled_at"?: string | null,"client_request_id": string,"contributed_at": string,"created_at"?: string,"created_by": string,"from_account_id"?: string | null,"goal_id": string,"group_id": string,"id"?: string,"member_id"?: string | null,"notes"?: string | null,"transaction_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"cancelled_at"?: string | null,"client_request_id"?: string,"contributed_at"?: string,"created_at"?: string,"created_by"?: string,"from_account_id"?: string | null,"goal_id"?: string,"group_id"?: string,"id"?: string,"member_id"?: string | null,"notes"?: string | null,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_contributions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_contributions_from_account_id_group_id_fkey"
      columns: ["from_account_id","group_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "goal_contributions_goal_id_group_id_fkey"
      columns: ["goal_id","group_id"]
isOneToOne: false
      referencedRelation: "savings_goals"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "goal_contributions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_contributions_group_id_member_id_fkey"
      columns: ["group_id","member_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "goal_contributions_transaction_id_group_id_fkey"
      columns: ["transaction_id","group_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id","group_id"]
    }
                  ]
                },"group_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string,"expires_at": string,"group_id": string,"id": string,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by": string,"expires_at": string,"group_id": string,"id"?: string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"group_id"?: string,"id"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invitations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invitations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"joined_at": string,"removed_at": string | null,"role": string,"share_percent": number,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"joined_at"?: string,"removed_at"?: string | null,"role"?: string,"share_percent"?: number,"status"?: string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"joined_at"?: string,"removed_at"?: string | null,"role"?: string,"share_percent"?: number,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"full_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"full_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"savings_goals": {
                  Row: {
                    "account_id": string | null,"created_at": string,"created_by": string,"deadline": string | null,"group_id": string,"id": string,"kind": string,"name": string,"status": string,"target_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string,"deadline"?: string | null,"group_id": string,"id"?: string,"kind"?: string,"name": string,"status"?: string,"target_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string,"deadline"?: string | null,"group_id"?: string,"id"?: string,"kind"?: string,"name"?: string,"status"?: string,"target_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_goals_account_id_group_id_fkey"
      columns: ["account_id","group_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "savings_goals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "savings_goals_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"settlement_payments": {
                  Row: {
                    "amount_cents": number,"cancelled_at": string | null,"cancelled_by": string | null,"client_request_id": string,"created_at": string,"created_by": string,"from_user": string,"group_id": string,"id": string,"notes": string | null,"paid_at": string,"payment_method": string | null,"settlement_id": string,"to_user": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_request_id": string,"created_at"?: string,"created_by": string,"from_user": string,"group_id": string,"id"?: string,"notes"?: string | null,"paid_at": string,"payment_method"?: string | null,"settlement_id": string,"to_user": string
                  }
                  Update: {
                    "amount_cents"?: number,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_request_id"?: string,"created_at"?: string,"created_by"?: string,"from_user"?: string,"group_id"?: string,"id"?: string,"notes"?: string | null,"paid_at"?: string,"payment_method"?: string | null,"settlement_id"?: string,"to_user"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_payments_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_payments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlement_payments_group_id_from_user_fkey"
      columns: ["group_id","from_user"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "settlement_payments_group_id_to_user_fkey"
      columns: ["group_id","to_user"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "settlement_payments_settlement_id_group_id_fkey"
      columns: ["settlement_id","group_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","group_id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string,"from_user": string,"group_id": string,"id": string,"paid_cents": number,"settled_at": string | null,"status": string,"to_user": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by": string,"from_user": string,"group_id": string,"id"?: string,"paid_cents"?: number,"settled_at"?: string | null,"status"?: string,"to_user": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string,"from_user"?: string,"group_id"?: string,"id"?: string,"paid_cents"?: number,"settled_at"?: string | null,"status"?: string,"to_user"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_group_id_from_user_fkey"
      columns: ["group_id","from_user"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "settlements_group_id_to_user_fkey"
      columns: ["group_id","to_user"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string | null,"amount_cents": number,"bill_occurrence_id": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"category_id": string | null,"client_request_id": string,"competence_date": string,"created_at": string,"created_by": string,"description": string,"group_id": string,"id": string,"kind": string,"notes": string | null,"paid_at": string | null,"paid_by": string | null,"payment_method": string | null,"split_mode": string | null,"status": string,"to_account_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount_cents": number,"bill_occurrence_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"category_id"?: string | null,"client_request_id": string,"competence_date": string,"created_at"?: string,"created_by": string,"description": string,"group_id": string,"id"?: string,"kind": string,"notes"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"payment_method"?: string | null,"split_mode"?: string | null,"status": string,"to_account_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "account_id"?: string | null,"amount_cents"?: number,"bill_occurrence_id"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"category_id"?: string | null,"client_request_id"?: string,"competence_date"?: string,"created_at"?: string,"created_by"?: string,"description"?: string,"group_id"?: string,"id"?: string,"kind"?: string,"notes"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"payment_method"?: string | null,"split_mode"?: string | null,"status"?: string,"to_account_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_group_id_fkey"
      columns: ["account_id","group_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "transactions_bill_occurrence_id_group_id_fkey"
      columns: ["bill_occurrence_id","group_id"]
isOneToOne: false
      referencedRelation: "bill_occurrences"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "transactions_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_group_id_fkey"
      columns: ["category_id","group_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "transactions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "financial_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_group_id_paid_by_fkey"
      columns: ["group_id","paid_by"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    },{
      foreignKeyName: "transactions_to_account_id_group_id_fkey"
      columns: ["to_account_id","group_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id","group_id"]
    },{
      foreignKeyName: "transactions_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"cancel_bill_occurrence":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_goal_contribution":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_settlement_payment":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_transaction":
{ Args: { "p_id": string,"p_reason"?: string }; Returns: undefined
                           },
"contribute_goal":
{ Args: { "p": Json }; Returns: string
                           },
"create_group":
{ Args: { "p_name": string }; Returns: string
                           },
"create_invitation":
{ Args: { "p_valid_hours"?: number }; Returns: {
              "expires_at": string,"invitation_id": string,"token": string
            }[]
                           },
"generate_bill_occurrences":
{ Args: { "p_until"?: string }; Returns: number
                           },
"get_account_balances":
{ Args: Record<PropertyKey, never>; Returns: {
              "account_id": string,"archived": boolean,"balance_cents": number,"kind": string,"name": string,"opening_balance_cents": number,"opening_missing": boolean,"owner_id": string
            }[]
                           },
"get_balance_series":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "balance_cents": number,"month": string
            }[]
                           },
"get_member_balances":
{ Args: { "p_include_planned"?: boolean }; Returns: {
              "full_name": string,"member_status": string,"net_cents": number,"paid_cents": number,"received_cents": number,"sent_cents": number,"share_cents": number,"user_id": string
            }[]
                           },
"pay_bill_occurrence":
{ Args: { "p": Json }; Returns: string
                           },
"preview_invitation":
{ Args: { "p_token": string }; Returns: {
              "expires_at": string,"group_name": string,"invited_by": string,"status": string
            }[]
                           },
"register_settlement_payment":
{ Args: { "p": Json }; Returns: string
                           },
"remove_attachment":
{ Args: { "p_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_user": string }; Returns: undefined
                           },
"revoke_invitation":
{ Args: { "p_invitation": string }; Returns: undefined
                           },
"save_bill":
{ Args: { "p": Json }; Returns: string
                           },
"save_transaction":
{ Args: { "p": Json }; Returns: string
                           },
"update_member_shares":
{ Args: { "p_shares": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
