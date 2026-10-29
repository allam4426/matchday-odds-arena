export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: number
        }
        Relationships: []
      }
      bet_selections: {
        Row: {
          bet_id: string
          id: string
          market_id: string
          market_name: string
          match_id: string
          match_label: string
          odds_accepted: number
          result: Database["public"]["Enums"]["selection_result"]
          selection_id: string
          selection_label: string
        }
        Insert: {
          bet_id: string
          id?: string
          market_id: string
          market_name: string
          match_id: string
          match_label: string
          odds_accepted: number
          result?: Database["public"]["Enums"]["selection_result"]
          selection_id: string
          selection_label: string
        }
        Update: {
          bet_id?: string
          id?: string
          market_id?: string
          market_name?: string
          match_id?: string
          match_label?: string
          odds_accepted?: number
          result?: Database["public"]["Enums"]["selection_result"]
          selection_id?: string
          selection_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_selections_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          bet_type: string
          id: string
          payout_minor: number
          placed_at: string
          potential_return_minor: number
          reference: string
          settled_at: string | null
          stake_minor: number
          status: Database["public"]["Enums"]["bet_status"]
          total_odds: number
          user_id: string
          void_reason: string | null
        }
        Insert: {
          bet_type: string
          id?: string
          payout_minor?: number
          placed_at?: string
          potential_return_minor: number
          reference: string
          settled_at?: string | null
          stake_minor: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_odds: number
          user_id: string
          void_reason?: string | null
        }
        Update: {
          bet_type?: string
          id?: string
          payout_minor?: number
          placed_at?: string
          potential_return_minor?: number
          reference?: string
          settled_at?: string | null
          stake_minor?: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_odds?: number
          user_id?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          country: string
          created_at: string
          id: string
          is_featured: boolean
          name: string
          provider_ref: string | null
          sort_order: number
          sport: string
          standings_synced_at: string | null
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          is_featured?: boolean
          name: string
          provider_ref?: string | null
          sort_order?: number
          sport?: string
          standings_synced_at?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          name?: string
          provider_ref?: string | null
          sort_order?: number
          sport?: string
          standings_synced_at?: string | null
        }
        Relationships: []
      }
      deposits: {
        Row: {
          amount_minor: number
          bank_reference: string
          created_at: string
          flagged_duplicate: boolean
          id: string
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slip_path: string
          status: Database["public"]["Enums"]["deposit_status"]
          user_id: string
          user_note: string | null
        }
        Insert: {
          amount_minor: number
          bank_reference: string
          created_at?: string
          flagged_duplicate?: boolean
          id?: string
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_path: string
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id: string
          user_note?: string | null
        }
        Update: {
          amount_minor?: number
          bank_reference?: string
          created_at?: string
          flagged_duplicate?: boolean
          id?: string
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_path?: string
          status?: Database["public"]["Enums"]["deposit_status"]
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_minor: number
          balance_after_minor: number
          counter_account: string
          created_at: string
          created_by: string | null
          description: string | null
          entry_type: string
          id: number
          reference: string
          related_id: string | null
          related_type: string | null
          reserved_change_minor: number
          user_id: string
        }
        Insert: {
          amount_minor: number
          balance_after_minor: number
          counter_account: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_type: string
          id?: number
          reference: string
          related_id?: string | null
          related_type?: string | null
          reserved_change_minor?: number
          user_id: string
        }
        Update: {
          amount_minor?: number
          balance_after_minor?: number
          counter_account?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_type?: string
          id?: number
          reference?: string
          related_id?: string | null
          related_type?: string | null
          reserved_change_minor?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          created_at: string
          id: string
          key: string
          match_id: string
          name: string
          settled_at: string | null
          settled_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["market_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          match_id: string
          name: string
          settled_at?: string | null
          settled_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["market_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          match_id?: string
          name?: string
          settled_at?: string | null
          settled_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["market_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_crest: string | null
          away_score: number
          away_team: string
          competition_id: string
          created_at: string
          created_by: string | null
          home_crest: string | null
          home_score: number
          home_team: string
          ht_away_score: number | null
          ht_home_score: number | null
          id: string
          is_hidden: boolean
          kickoff_at: string
          minute: number | null
          provenance: string
          provider_ref: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        Insert: {
          away_crest?: string | null
          away_score?: number
          away_team: string
          competition_id: string
          created_at?: string
          created_by?: string | null
          home_crest?: string | null
          home_score?: number
          home_team: string
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          is_hidden?: boolean
          kickoff_at: string
          minute?: number | null
          provenance?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Update: {
          away_crest?: string | null
          away_score?: number
          away_team?: string
          competition_id?: string
          created_at?: string
          created_by?: string | null
          home_crest?: string | null
          home_score?: number
          home_team?: string
          ht_away_score?: number | null
          ht_home_score?: number | null
          id?: string
          is_hidden?: boolean
          kickoff_at?: string
          minute?: number | null
          provenance?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: number
          new_odds: number
          old_odds: number | null
          selection_id: string
          source: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: number
          new_odds: number
          old_odds?: number | null
          selection_id: string
          source?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: number
          new_odds?: number
          old_odds?: number | null
          selection_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_history_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_note: string | null
          approved: boolean
          cooling_off_until: string | null
          country: string
          created_at: string
          date_of_birth: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          self_excluded_until: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          username: string
        }
        Insert: {
          admin_note?: string | null
          approved?: boolean
          cooling_off_until?: string | null
          country: string
          created_at?: string
          date_of_birth: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          self_excluded_until?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          username: string
        }
        Update: {
          admin_note?: string | null
          approved?: boolean
          cooling_off_until?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          self_excluded_until?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      provider_team_stats: {
        Row: {
          competition_ref: string
          goals_against: number
          goals_for: number
          played: number
          points: number
          position: number | null
          team_name: string
          team_ref: string
          updated_at: string
        }
        Insert: {
          competition_ref: string
          goals_against?: number
          goals_for?: number
          played?: number
          points?: number
          position?: number | null
          team_name: string
          team_ref: string
          updated_at?: string
        }
        Update: {
          competition_ref?: string
          goals_against?: number
          goals_for?: number
          played?: number
          points?: number
          position?: number | null
          team_name?: string
          team_ref?: string
          updated_at?: string
        }
        Relationships: []
      }
      rg_limits: {
        Row: {
          daily_deposit_limit_minor: number | null
          daily_stake_limit_minor: number | null
          session_reminder_minutes: number
          updated_at: string
          user_id: string
          weekly_deposit_limit_minor: number | null
        }
        Insert: {
          daily_deposit_limit_minor?: number | null
          daily_stake_limit_minor?: number | null
          session_reminder_minutes?: number
          updated_at?: string
          user_id: string
          weekly_deposit_limit_minor?: number | null
        }
        Update: {
          daily_deposit_limit_minor?: number | null
          daily_stake_limit_minor?: number | null
          session_reminder_minutes?: number
          updated_at?: string
          user_id?: string
          weekly_deposit_limit_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rg_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      selections: {
        Row: {
          id: string
          label: string
          market_id: string
          odds: number
          result: Database["public"]["Enums"]["selection_result"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          market_id: string
          odds: number
          result?: Database["public"]["Enums"]["selection_result"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          market_id?: string
          odds?: number
          result?: Database["public"]["Enums"]["selection_result"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "selections_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_accounts: {
        Row: {
          balance_minor: number
          reserved_minor: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_minor?: number
          reserved_minor?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_minor?: number
          reserved_minor?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          account_name: string
          account_number: string
          amount_minor: number
          bank_name: string
          created_at: string
          id: string
          paid_at: string | null
          payment_reference: string | null
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          amount_minor: number
          bank_name: string
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          amount_minor?: number
          bank_name?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assert_active: {
        Args: { _for_betting: boolean; _user: string }
        Returns: undefined
      }
      _audit: {
        Args: {
          _action: string
          _details: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: undefined
      }
      _create_match_markets: {
        Args: {
          _a: number
          _d: number
          _h: number
          _match: string
          _open_derived: boolean
        }
        Returns: undefined
      }
      _notify: {
        Args: { _body: string; _kind: string; _title: string; _user: string }
        Returns: undefined
      }
      _post_ledger: {
        Args: {
          _amount: number
          _counter: string
          _description: string
          _reference: string
          _related_id: string
          _related_type: string
          _reserved: number
          _type: string
          _user: string
        }
        Returns: number
      }
      _provider_settle_match: {
        Args: { _a: number; _h: number; _match: string; _void: boolean }
        Returns: number
      }
      _settle_bet: { Args: { _bet: string }; Returns: undefined }
      admin_approve_user: {
        Args: { _approve: boolean; _user: string }
        Returns: undefined
      }
      admin_create_match: {
        Args: {
          _a: number
          _away: string
          _competition: string
          _d: number
          _h: number
          _home: string
          _kickoff: string
        }
        Returns: string
      }
      admin_exists: { Args: never; Returns: boolean }
      admin_review_deposit: {
        Args: { _decision: string; _id: string; _note: string }
        Returns: undefined
      }
      admin_set_market_status: {
        Args: {
          _market: string
          _status: Database["public"]["Enums"]["market_status"]
        }
        Returns: undefined
      }
      admin_set_odds: {
        Args: { _odds: number; _selection: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: {
          _note: string
          _status: Database["public"]["Enums"]["account_status"]
          _user: string
        }
        Returns: undefined
      }
      admin_settle_market: {
        Args: { _market: string; _void: boolean; _winners: string[] }
        Returns: number
      }
      admin_stats: { Args: never; Returns: Json }
      admin_update_match: {
        Args: {
          _away_score: number
          _hidden: boolean
          _home_score: number
          _ht_away: number
          _ht_home: number
          _id: string
          _minute: number
          _status: Database["public"]["Enums"]["match_status"]
        }
        Returns: undefined
      }
      admin_update_setting: {
        Args: { _key: string; _value: Json }
        Returns: undefined
      }
      admin_update_withdrawal: {
        Args: {
          _id: string
          _note: string
          _payment_reference: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
        }
        Returns: undefined
      }
      admin_void_bet: {
        Args: { _bet: string; _reason: string }
        Returns: undefined
      }
      can_finance: { Args: { _user_id: string }; Returns: boolean }
      can_trade: { Args: { _user_id: string }; Returns: boolean }
      cancel_deposit: { Args: { _id: string }; Returns: undefined }
      cancel_withdrawal: { Args: { _id: string }; Returns: undefined }
      claim_first_admin: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      place_bet: {
        Args: {
          _accept_odds_changes?: boolean
          _bet_type: string
          _items: Json
          _stake_minor: number
        }
        Returns: Json
      }
      provider_set_crests: { Args: { _items: Json }; Returns: undefined }
      provider_sync: { Args: { _matches: Json }; Returns: Json }
      request_withdrawal: {
        Args: {
          _account_name: string
          _account_number: string
          _amount_minor: number
          _bank_name: string
        }
        Returns: string
      }
      self_exclude: { Args: { _days: number }; Returns: undefined }
      set_rg_limits: {
        Args: {
          _daily_deposit: number
          _daily_stake: number
          _reminder_minutes: number
          _weekly_deposit: number
        }
        Returns: undefined
      }
      setting_bigint: { Args: { _key: string }; Returns: number }
      submit_deposit: {
        Args: {
          _amount_minor: number
          _bank_reference: string
          _note?: string
          _slip_path: string
        }
        Returns: string
      }
      take_break: { Args: { _hours: number }; Returns: undefined }
      username_available: { Args: { _username: string }; Returns: boolean }
      wallet_summary: { Args: never; Returns: Json }
    }
    Enums: {
      account_status: "active" | "suspended" | "self_excluded" | "closed"
      app_role:
        | "super_admin"
        | "finance_admin"
        | "sports_trader"
        | "support_agent"
        | "auditor"
      bet_status: "open" | "won" | "lost" | "void"
      deposit_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
        | "cancelled"
      market_status: "open" | "suspended" | "settled" | "void"
      match_status:
        | "scheduled"
        | "live"
        | "finished"
        | "postponed"
        | "cancelled"
        | "abandoned"
      selection_result: "pending" | "won" | "lost" | "void"
      withdrawal_status:
        | "requested"
        | "pending_review"
        | "approved"
        | "processing"
        | "paid"
        | "rejected"
        | "cancelled"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "self_excluded", "closed"],
      app_role: [
        "super_admin",
        "finance_admin",
        "sports_trader",
        "support_agent",
        "auditor",
      ],
      bet_status: ["open", "won", "lost", "void"],
      deposit_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "cancelled",
      ],
      market_status: ["open", "suspended", "settled", "void"],
      match_status: [
        "scheduled",
        "live",
        "finished",
        "postponed",
        "cancelled",
        "abandoned",
      ],
      selection_result: ["pending", "won", "lost", "void"],
      withdrawal_status: [
        "requested",
        "pending_review",
        "approved",
        "processing",
        "paid",
        "rejected",
        "cancelled",
        "failed",
      ],
    },
  },
} as const
