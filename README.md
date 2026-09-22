# VoteFlow MVP

Build a complete Online Voting System MVP using React, TypeScript, Tailwind CSS, and Supabase.

The goal is to create a simple, secure, modern, responsive voting system suitable for an HND Software and Web Development project.

1. User Roles

Create two roles:

Admin

Voter

Users must only access pages allowed for their role.

2. Authentication

Use Supabase Authentication.

Create:

Login page

Voter registration page

Logout

Protected routes

Role-based access

After login:

Voters go to the voter dashboard.

Admins go to the admin dashboard.

Do not store passwords manually in the database.

3. Database

Create the necessary Supabase PostgreSQL tables:

profiles

id

full_name

email

voter_id

role

created_at

candidates

id

full_name

position

manifesto

photo_url

created_at

elections

id

title

description

start_time

end_time

status

created_at

votes

id

election_id

voter_id

candidate_id

created_at

audit_logs

id

user_id

action

created_at

Use proper foreign keys, indexes, constraints, and timestamps.

4. Voting Rules

Implement these rules:

Only authenticated voters can vote.

Voting is allowed only when the election is open.

A voter cannot submit more than one vote for the same election.

After successfully voting, disable the voting interface for that election.

Show a clear confirmation message after a successful vote.

Do not expose a voter's candidate choice in the audit log.

Use database-level constraints and Supabase Row Level Security (RLS), not only frontend checks, to enforce important security rules.

5. Voter Dashboard

Create a clean dashboard containing:

Welcome message

Voter information

Current election status

List of candidates

Candidate photos

Candidate positions

Candidate manifestos

Vote button

Vote confirmation dialog

Voting status

The voter should have a simple and easy-to-understand interface.

6. Admin Dashboard

Create an admin dashboard containing:

Total voters

Total candidates

Election status

Total votes

Manage candidates

Manage voters

Create/edit election

Open/close election

View audit logs

Admins must not be able to modify submitted votes directly through the normal dashboard.

7. Candidate Management

Allow admins to:

Add candidate

Edit candidate

Delete candidate

Upload candidate photo

Assign candidate to a position

Validate all form inputs.

8. Audit Trail

Record important security-related actions such as:

Login

Logout

Registration

Candidate creation

Candidate update

Candidate deletion

Election creation

Election status changes

Vote submission

Do NOT record the candidate selected by a voter inside the audit log.

9. Security

Implement:

Supabase Auth

Row Level Security (RLS)

Protected routes

Role-based authorization

Secure database policies

Input validation

Error handling

No passwords stored in custom tables

No service-role keys in frontend code

Environment variables for Supabase configuration

Never rely only on frontend restrictions for authorization.

10. UI Design

Create a professional modern interface suitable for an academic project.

Use:

Clean navigation

Responsive layout

Dashboard cards

Tables

Forms

Modal confirmation dialogs

Loading states

Empty states

Success/error notifications

Mobile-friendly design

Keep the design professional and simple rather than unnecessarily complicated.

11. Important MVP Requirement

Do NOT add unnecessary features such as:

AI

Cryptocurrency

Online payment

Social media login

Complex messaging

Mobile application

Unnecessary animations

Focus on making the core voting system actually work.

12. Development Order

Build and test the system in this order:

Supabase connection

Database schema

Authentication

User profiles and roles

Protected routes

Admin dashboard

Candidate management

Election management

Voter dashboard

Voting functionality

One-vote restriction

Audit trail

RLS security policies

Validation and error handling

Responsive UI

Final testing

13. Final Requirement

Generate the complete working application, not just static UI screens.

Connect every form and button to Supabase where appropriate.

Use real Supabase data instead of mock data.

Make sure the application can:

Register → Login → Authenticate → View Election → View Candidates → Vote Once → Save Vote → Record Audit Activity → Prevent Duplicate Voting → Allow Admin Management.

Before finishing, check for broken routes, database errors, authentication problems, RLS problems, and TypeScript errors.

The final result should be a functional Online Voting System MVP that can later be expanded with additional features.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://online-voting-atap.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e81df1f2-98bc-46d6-abed-f0b0a1af0610).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
