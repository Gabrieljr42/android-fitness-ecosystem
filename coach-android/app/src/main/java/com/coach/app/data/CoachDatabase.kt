package com.coach.app.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class CoachDatabase(
    context: Context,
    name: String? = "coach.db"
) : SQLiteOpenHelper(context, name, null, Schema.VERSION) {

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        applyMigrations(db, 0)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        require(oldVersion >= 0 && newVersion == Schema.VERSION && oldVersion <= Schema.VERSION) {
            "unsupported schema transition $oldVersion -> $newVersion"
        }
        applyMigrations(db, oldVersion)
    }

    private fun applyMigrations(db: SQLiteDatabase, fromVersion: Int) {
        db.beginTransaction()
        try {
            for (statement in Schema.migrationStepsFrom(fromVersion)) {
                db.execSQL(statement)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}
